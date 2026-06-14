import { PrismaClient } from '@prisma/client';

export enum EscrowStatus {
  FUNDED = 'FUNDED',
  AUCTION_WON = 'AUCTION_WON',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  RELEASED = 'RELEASED',
  DISPUTED = 'DISPUTED',
  REFUNDED = 'REFUNDED'
}

export enum LedgerType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  HOLD = 'HOLD',
  RELEASE = 'RELEASE'
}

export class EscrowStateMachine {
  private prisma: PrismaClient;

  constructor(prismaInstance: PrismaClient) {
    this.prisma = prismaInstance;
  }

  /**
   * Calculates dynamic aggregate balance of a user from append-only ledger transaction inputs
   */
  public async computeUserBalance(userId: string): Promise<{
    total: number;
    available: number;
    escrowed: number;
  }> {
    const rawLedgers = await this.prisma.walletLedger.findMany({
      where: { userId }
    });

    let total = 0;
    let available = 0;
    let escrowed = 0;

    for (const entry of rawLedgers) {
      const amount = Number(entry.amount);
      if (entry.type === LedgerType.CREDIT) {
        total += amount;
        available += amount;
      } else if (entry.type === LedgerType.DEBIT) {
        total -= amount;
        available -= amount;
      } else if (entry.type === LedgerType.HOLD) {
        // Amount is put on escrow hold
        available -= amount;
        escrowed += amount;
      } else if (entry.type === LedgerType.RELEASE) {
        // Escrow released (either returned or settled onward)
        escrowed -= amount;
        available += amount;
      }
    }

    return { total, available, escrowed };
  }

  /**
   * Safely registers hold balances on a leading bidder
   */
  public async fundBidHold(params: {
    userId: string;
    auctionId: string;
    bidId: string;
    amount: number;
  }): Promise<void> {
    const { available } = await this.computeUserBalance(params.userId);
    if (available < params.amount) {
      throw new Error(`Insufficient funds: Available ${available} JOD, required ${params.amount} JOD.`);
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Write the hold record to append-only wallet ledger
      await tx.walletLedger.create({
        data: {
          userId: params.userId,
          amount: params.amount,
          type: LedgerType.HOLD,
          referenceId: params.bidId,
          referenceType: 'BID'
        }
      });
    });
  }

  /**
   * Releases specific bid holds when they are outbid
   */
  public async refundReleasedHold(params: {
    userId: string;
    bidId: string;
    amount: number;
  }): Promise<void> {
    await this.prisma.walletLedger.create({
      data: {
        userId: params.userId,
        amount: params.amount,
        type: LedgerType.RELEASE,
        referenceId: params.bidId,
        referenceType: 'BID'
      }
    });
  }

  /**
   * locks final winning bids inside an Escrow Contract state machine
   */
  public async lockAuctionWinEscrow(params: {
    auctionId: string;
    buyerId: string;
    sellerId: string;
    amount: number;
    stripePaymentIntentId?: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Create central escrow tracker
      await tx.escrowTransaction.create({
        data: {
          auctionId: params.auctionId,
          buyerId: params.buyerId,
          sellerId: params.sellerId,
          amount: params.amount,
          status: EscrowStatus.AUCTION_WON,
          stripePaymentIntentId: params.stripePaymentIntentId || null
        }
      });

      // 2. Add DEBIT ledger entry corresponding to escrow contract locked funds
      await tx.walletLedger.create({
        data: {
          userId: params.buyerId,
          amount: params.amount,
          type: LedgerType.DEBIT,
          referenceId: params.auctionId,
          referenceType: 'AUCTION'
        }
      });
    });
  }

  /**
   * Sets final delivery shipment on active escrow
   */
  public async transitionToShipped(escrowId: string): Promise<void> {
    await this.prisma.escrowTransaction.update({
      where: { id: escrowId },
      data: { status: EscrowStatus.SHIPPED }
    });
  }

  /**
   * Confirm shipping hand-over and release held assets to seller
   */
  public async checkoutReleaseToSeller(escrowId: string): Promise<void> {
    const escrow = await this.prisma.escrowTransaction.findUnique({
      where: { id: escrowId }
    });

    if (!escrow || escrow.status === EscrowStatus.RELEASED) {
      throw new Error("Invalid or already completed escrow session.");
    }

    await this.prisma.$transaction(async (tx) => {
      // Update state
      await tx.escrowTransaction.update({
        where: { id: escrowId },
        data: { status: EscrowStatus.RELEASED }
      });

      // Credit the seller wallet via ledger
      await tx.walletLedger.create({
        data: {
          userId: escrow.sellerId,
          amount: escrow.amount,
          type: LedgerType.CREDIT,
          referenceId: escrow.auctionId,
          referenceType: 'RELEASE'
        }
      });
    });
  }

  /**
   * Hold assets for manual admin review upon client raising a claim
   */
  public async declareDispute(escrowId: string): Promise<void> {
    await this.prisma.escrowTransaction.update({
      where: { id: escrowId },
      data: { status: EscrowStatus.DISPUTED }
    });
  }

  /**
   * Resolves existing disputes either by direct refunding or payment completing
   */
  public async resolveDispute(escrowId: string, resolution: 'REFUND' | 'RELEASE'): Promise<void> {
    const escrow = await this.prisma.escrowTransaction.findUnique({
      where: { id: escrowId }
    });

    if (!escrow || escrow.status !== EscrowStatus.DISPUTED) {
      throw new Error("Only disputed escrow sessions may be manual-resolved.");
    }

    await this.prisma.$transaction(async (tx) => {
      if (resolution === 'REFUND') {
        await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: { status: EscrowStatus.REFUNDED }
        });

        // Credit money back to Buyer
        await tx.walletLedger.create({
          data: {
            userId: escrow.buyerId,
            amount: escrow.amount,
            type: LedgerType.CREDIT,
            referenceId: escrow.auctionId,
            referenceType: 'REFUND'
          }
        });
      } else {
        await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: { status: EscrowStatus.RELEASED }
        });

        // Credit to Seller
        await tx.walletLedger.create({
          data: {
            userId: escrow.sellerId,
            amount: escrow.amount,
            type: LedgerType.CREDIT,
            referenceId: escrow.auctionId,
            referenceType: 'RELEASE'
          }
        });
      }
    });
  }
}

import React from 'react';
import { motion } from 'motion/react';
import { Scale, X, Sparkles } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsModal({ isOpen, onClose }: TermsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4 overflow-y-auto" dir="ltr">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white border border-[#E5E5E5] rounded-[24px] w-full max-w-lg shadow-[0_24px_50px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col my-auto max-h-[85vh] text-left"
      >
        {/* Header */}
        <div className="bg-zinc-50 p-5 border-b border-[#E5E5E5] shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-[#FF6B00]/10 p-2 rounded-xl border border-[#FF6B00]/20">
              <Scale className="w-5 h-5 text-[#FF6B00]" />
            </div>
            <div>
              <h2 className="text-sm font-black text-zinc-900 font-sans">Terms of Use & Privacy Policies</h2>
              <p className="text-[10px] text-zinc-500 mt-0.5">Mazad JO | Jordan Bidding Platforms</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 active:scale-95 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Document Content */}
        <div className="p-6 overflow-y-auto space-y-7 text-zinc-700 text-xs font-sans leading-relaxed scrollbar-thin">
          
          {/* Welcome Intro */}
          <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 text-center space-y-1">
            <Sparkles className="w-5 h-5 text-[#FF6B00] mx-auto animate-pulse" />
            <h3 className="font-extrabold text-[#FF6B00] text-sm font-sans">Welcome to Mazad JO</h3>
            <p className="text-[10px] text-zinc-500">Jordan's Premier Smart Online Live Bidding Platform</p>
          </div>

          {/* 1. SECTOR: PAYMENT POLICY */}
          <div className="space-y-2.5">
            <h4 className="font-black text-zinc-900 text-xs flex items-center gap-2 pb-1 border-b border-zinc-200 font-sans">
              <span className="w-1.5 h-1.5 bg-[#FF6B00] rounded-full" />
              <span>💸 Payment & Settlements</span>
            </h4>
            <ul className="space-y-2 list-none pl-0 text-zinc-700">
              <li className="flex items-start gap-1.5">
                <span className="text-[#FF6B00] mt-0.5 select-none">•</span>
                <span>The winning bid must be fully settled and processed to verification within <strong>3 hours</strong> of auction end.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#FF6B00] mt-0.5 select-none">•</span>
                <div>
                  <span className="block mb-1">Approved payment channels within Jordan:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className="bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-200 text-[10px] text-zinc-700">Credit Card</span>
                    <span className="bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-200 text-[10px] text-zinc-700">CliQ Instant Transfer</span>
                    <span className="bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-200 text-[10px] text-zinc-700">Mobile Wallets</span>
                    <span className="bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-200 text-[10px] text-zinc-700">Pay on Delivery (VIP Tier Only)</span>
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-1.5 text-orange-600">
                <span className="text-[#FF6B00] mt-0.5 select-none">•</span>
                <span>Failure to complete payment within the designated timeframe auto-authorizes the admin team to re-list the device live immediately.</span>
              </li>
            </ul>
          </div>

          {/* 2. SECTOR: SHIPPING POLICY */}
          <div className="space-y-2.5">
            <h4 className="font-black text-zinc-900 text-xs flex items-center gap-2 pb-1 border-b border-zinc-200 font-sans">
              <span className="w-1.5 h-1.5 bg-[#FF6B00] rounded-full" />
              <span>🚚 Dispatch & Courier Delivery</span>
            </h4>
            <ul className="space-y-2 list-none pl-0 text-zinc-700">
              <li className="flex items-start gap-1.5">
                <span className="text-[#FF6B00] mt-0.5 select-none">•</span>
                <span>Standard verified shipments are processed and dispatched within <strong>1 to 6 business days</strong>.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#FF6B00] mt-0.5 select-none">•</span>
                <span>Shipping rates are transparently detailed during order processing based on Jordan regional shipping service limits.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#FF6B00] mt-0.5 select-none">•</span>
                <span>Receiver is responsible for providing valid local contact details and delivery addresses.</span>
              </li>
            </ul>
          </div>

          {/* 3. SECTOR: RETURNS & REFUNDS */}
          <div className="space-y-4">
            <h4 className="font-black text-zinc-900 text-xs flex items-center gap-2 pb-1 border-b border-zinc-200 font-sans">
              <span className="w-1.5 h-1.5 bg-[#FF6B00] rounded-full" />
              <span>🔄 Returns & Guarded Escrow</span>
            </h4>
            
            <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200 space-y-1.5">
              <span className="text-[#FF6B00] font-extrabold text-[11px] block font-sans">🛍️ New Sealed Retail Items:</span>
              <p className="text-[11px] text-zinc-650">
                Eligible for return within <strong>7 days</strong> if returned in pristine, unused packaging containing all original sealed stickers and components intact.
              </p>
            </div>

            <div className="bg-red-50/5 rounded-xl p-3 border border-red-100 space-y-1.5">
              <span className="text-red-600 font-extrabold text-[11px] block font-sans">⚖️ Bidding & Used Showcase Items:</span>
              <p className="text-[11px] text-zinc-650 leading-normal">
                All finished live bids are final and legally binding. Returns are strictly disallowed except for high-priority mismatch scenarios:
              </p>
              <ul className="text-[10px] text-zinc-500 list-disc pl-4 space-y-1">
                <li>Material characteristics differ fundamentally from listing details.</li>
                <li>Presence of severe undisclosed technical defects or battery health mismatch.</li>
              </ul>
            </div>
          </div>

          {/* 4. SECTOR: SELLER RESPONSIBILITIES */}
          <div className="space-y-2.5">
            <h4 className="font-black text-zinc-900 text-xs flex items-center gap-2 pb-1 border-b border-zinc-200 font-sans">
              <span className="w-1.5 h-1.5 bg-[#FF6B00] rounded-full" />
              <span>⚖️ Merchant & Seller Conduct</span>
            </h4>
            <ul className="space-y-2 list-none pl-0 text-zinc-700">
              <li className="flex items-start gap-1.5">
                <span className="text-[#FF6B00] mt-0.5 select-none">•</span>
                <span>Merchants are held strictly responsible for accurate battery levels, localized defects, transparent colors, and physical body disclosures.</span>
              </li>
              <li className="flex items-start gap-1.5 text-red-600">
                <span className="text-[#FF6B00] mt-0.5 select-none">•</span>
                <span>Mazad JO reserves absolute authority to deactivate merchant accounts and hold funds if deceptive claims are resolved.</span>
              </li>
            </ul>
          </div>

          {/* 5. SECTOR: COMMISSIONS & FEES */}
          <div className="space-y-2.5">
            <h4 className="font-black text-zinc-900 text-xs flex items-center gap-2 pb-1 border-b border-zinc-200 font-sans">
              <span className="w-1.5 h-1.5 bg-[#FF6B00] rounded-full" />
              <span>📊 Service Commission Rates</span>
            </h4>
            <div className="bg-[#FF6B00]/5 border border-[#FF6B00]/15 rounded-xl p-3.5 text-center space-y-1">
              <span className="text-[#FF6B00] text-sm font-black font-sans">Flat Platform Fee: 7 JOD</span>
              <p className="text-[10px] text-zinc-500">Deducted transparently from final listing success value to support secure operations, shipment escrows, and instant technical support channels.</p>
            </div>
          </div>

          {/* 6. PRIVACY SECURITY */}
          <div className="space-y-2.5 bg-transparent p-0 border-none">
            <h4 className="font-black text-zinc-900 text-xs flex items-center gap-2 pb-1 border-b border-zinc-200 font-sans">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-emerald-700">🔒 Privacy, Encrypted Store & Data Protection</span>
            </h4>
            <ul className="space-y-2 list-none pl-0 text-zinc-700">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-600 mt-0.5 select-none">•</span>
                <span>All transaction screenshots, receiver addresses, and phone numbers are encrypted safely on-device and never distributed to third parties.</span>
              </li>
            </ul>
          </div>

          {/* Automatic Consent Banner */}
          <div className="bg-emerald-50/70 text-emerald-700 border border-emerald-200 p-3 rounded-xl text-center text-[10px] space-y-0.5">
            <p className="font-black font-sans text-emerald-800">💡 Automated Policy Agreement Note:</p>
            <p>Accessing the bidding queues, registering a membership plan, or sending support chats denotes express legal consensus under the guidelines listed above.</p>
          </div>

          {/* Revision Footnote */}
          <div className="text-center text-zinc-400 text-[10px] space-y-1 font-mono pt-3 border-t border-zinc-200/80">
            <p>Last Document Revision Date: June 2026</p>
            <p className="font-sans font-extrabold text-[#FF6B00]">All Rights Reserved © Mazad JO | Jordan Auctions</p>
          </div>

        </div>

        {/* Action Button Footer */}
        <div className="bg-zinc-50 p-4 border-t border-[#E5E5E5] shrink-0 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-[#FF6B00] text-white hover:bg-[#e05e00] font-black py-3 rounded-2xl text-center text-xs transition-all active:scale-95 cursor-pointer shadow-md select-none"
          >
            I Accept and Agree to the Bidding Policies
          </button>
        </div>
      </motion.div>
    </div>
  );
}

import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AdminListSkeleton, EmptyState } from '../FeedbackStates';

/**
 * Payouts (Job 5): the merchant-withdrawal audit queue — behavior-preserving
 * extraction of the former `withdrawals` tab body. Purely presentational + the
 * two withdrawal wrapper handlers (moved verbatim) which invoke the injected
 * server callables `onApprove`/`onReject` byte-identically. Creates NO Firestore
 * listeners. `isProcessingAction` is owned locally (used only here); the
 * reject-reason draft state is shared with the still-inline listings body and is
 * therefore injected from the shell.
 */
export interface PayoutsSectionProps {
  isAr: boolean;
  isLoading: boolean;
  withdrawals: any[]; // allWithdrawals (pending + de-duped history)
  rejectingId: string | null;
  setRejectingId: (id: string | null) => void;
  rejectionReason: string;
  setRejectionReason: (reason: string) => void;
  onApprove: (withdrawalId: string) => Promise<any>; // approveWithdrawal
  onReject: (withdrawalId: string, reason: string) => Promise<any>; // rejectWithdrawal
}

export const PayoutsSection: React.FC<PayoutsSectionProps> = ({
  isAr,
  isLoading,
  withdrawals: allWithdrawals,
  rejectingId,
  setRejectingId,
  rejectionReason,
  setRejectionReason,
  onApprove,
  onReject,
}) => {
  const [isProcessingAction, setIsProcessingAction] = useState<Record<string, boolean>>({});

  const handleApproveWithdrawal = async (withdrawalId: string) => {
    if (isProcessingAction[withdrawalId]) return;
    setIsProcessingAction(prev => ({ ...prev, [withdrawalId]: true }));
    try {
      const result = await onApprove(withdrawalId);
      if (result.success) {
        alert(isAr ? 'تمت الموافقة على طلب السحب بنجاح وتحرير الرصيد!' : 'Withdrawal approved successfully!');
      } else {
        alert(isAr ? `فشلت العملية: ${result.message}` : `Failed: ${result.message}`);
      }
    } catch (err: any) {
      console.error("Error approving withdrawal:", err);
      alert(err.message || (isAr ? 'خطأ في تنفيذ العملية' : 'Error executing operation'));
    } finally {
      setIsProcessingAction(prev => ({ ...prev, [withdrawalId]: false }));
    }
  };

  const handleRejectWithdrawal = async (withdrawalId: string) => {
    if (isProcessingAction[withdrawalId]) return;
    if (!rejectionReason.trim()) {
      alert(isAr ? 'يرجى كتابة سبب الرفض أولاً' : 'Please provide a rejection reason');
      return;
    }
    setIsProcessingAction(prev => ({ ...prev, [withdrawalId]: true }));
    try {
      const result = await onReject(withdrawalId, rejectionReason);
      if (result.success) {
        alert(isAr ? 'تم رفض طلب السحب وإرجاع المبلغ لمحفظة البائع.' : 'Withdrawal rejected and funds returned to seller.');
        setRejectingId(null);
        setRejectionReason('');
      } else {
        alert(isAr ? `فشلت العملية: ${result.message}` : `Failed: ${result.message}`);
      }
    } catch (err: any) {
      console.error("Error rejecting withdrawal:", err);
      alert(err.message || (isAr ? 'خطأ في تنفيذ العملية' : 'Error executing operation'));
    } finally {
      setIsProcessingAction(prev => ({ ...prev, [withdrawalId]: false }));
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-xs">
        <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#FF6B00]" />
          {isAr ? 'إدارة طلبات السحب المالي للبائعين' : 'MERCHANT WITHDRAWAL AUDIT'}
        </h3>
        <p className="text-[11px] text-gray-400 mt-1">
          {isAr ? 'مراجعة وتدقيق ومعالجة طلبات سحب الأرصدة المقدمة من قبل التجار والبائعين في المنصة.' : 'Audit, approve, or reject vendor payout requests securely via server-side ledger operations.'}
        </p>
      </div>

      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <AdminListSkeleton />
        </div>
      ) : allWithdrawals.length === 0 ? (
        <EmptyState
          title={isAr ? 'لا توجد طلبات سحب مسجلة' : 'No withdrawal requests'}
          description={isAr ? 'لم يتم تسجيل أي طلبات سحب مالي في قاعدة البيانات حتى الآن.' : 'No merchant payout transactions have been recorded in the database yet.'}
          language={isAr ? 'ar' : 'en'}
          icon={<ShieldCheck className="w-6 h-6 text-gray-400" />}
        />
      ) : (
        <div className="space-y-3">
          {allWithdrawals.map((req) => {
            const isPending = req.status === 'pending_review';
            const isCompleted = req.status === 'completed';
            const isRejected = req.status === 'rejected';

            let statusBadge = '';
            if (isPending) {
              statusBadge = 'bg-amber-50 text-amber-700 border-amber-200';
            } else if (isCompleted) {
              statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            } else {
              statusBadge = 'bg-rose-50 text-rose-700 border-rose-200';
            }

            return (
              <div key={req.id} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-fadeIn transition-all hover:border-gray-200">
                <div className="space-y-3 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] border rounded-full font-bold px-2.5 py-0.5 uppercase tracking-wider ${statusBadge}`}>
                      {req.status === 'pending_review' ? (isAr ? 'قيد المراجعة' : 'Pending Review') : req.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') : (isAr ? 'مرفوض' : 'Rejected')}
                    </span>
                    <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full font-mono px-2 py-0.5">
                      {req.referenceId || req.id}
                    </span>
                    <span className="text-xs text-[#E85D04] font-mono font-bold">
                      {req.amount} JOD
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-extrabold text-xs text-gray-400 uppercase tracking-wider">
                      {isAr ? 'تفاصيل صاحب الطلب المستلم:' : 'REQUESTING VENDOR:'}
                    </h4>
                    <p className="text-xs text-gray-500 font-mono font-bold font-mono">UID: {req.userId}</p>
                    {req.timestamp && (
                      <p className="text-[10px] text-gray-500">
                        <span className="font-semibold">{isAr ? 'تاريخ الطلب: ' : 'Requested At: '}</span>
                        {new Date(req.timestamp).toLocaleString(isAr ? 'ar-JO' : 'en-US')}
                      </p>
                    )}
                  </div>

                  <div className="bg-gray-50 border border-gray-200 p-3 rounded-xl text-xs space-y-1.5 font-mono">
                    <p className="text-gray-600">
                      <strong className="text-gray-800">{isAr ? 'طريقة السحب:' : 'Payout Method:'}</strong> {req.type === 'cliq' ? (isAr ? 'كليك (CliQ)' : 'CliQ') : (isAr ? 'حوالة بنكية' : 'Bank Transfer')}
                    </p>
                    {req.details && Object.entries(req.details).map(([key, val]: [string, any]) => (
                      <p className="text-gray-600 text-[11px]" key={key}>
                        <strong className="text-gray-800 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</strong> {String(val)}
                      </p>
                    ))}
                    {isRejected && req.rejectionReason && (
                      <p className="text-rose-600 font-bold bg-rose-50 border border-rose-100 p-2 rounded-lg mt-1 text-[11px]">
                        <strong>{isAr ? 'سبب الرفض:' : 'Rejection Reason:'}</strong> {req.rejectionReason}
                      </p>
                    )}
                  </div>
                </div>

                {isPending && (
                  <div className="flex flex-col gap-2 shrink-0 md:w-48">
                    {rejectingId === req.id ? (
                      <div className="space-y-2">
                        <textarea
                          placeholder={isAr ? 'اكتب سبب الرفض...' : 'Enter rejection reason...'}
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          className="w-full text-xs p-2 border border-rose-200 rounded-xl bg-rose-50/20 focus:outline-none focus:ring-1 focus:ring-rose-400"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRejectWithdrawal(req.id)}
                            disabled={isProcessingAction[req.id]}
                            className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[11px] font-black py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            {isProcessingAction[req.id] ? (isAr ? 'جاري الرفض...' : 'Rejecting...') : (isAr ? 'تأكيد الرفض' : 'Confirm')}
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(null);
                              setRejectionReason('');
                            }}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-black px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleApproveWithdrawal(req.id)}
                          disabled={isProcessingAction[req.id]}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black py-2.5 rounded-xl transition-colors cursor-pointer shadow-xs"
                        >
                          {isProcessingAction[req.id] ? (isAr ? 'جاري المعالجة...' : 'Processing...') : (isAr ? 'موافقة وصرف الرصيد' : 'Approve & Release')}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(req.id);
                            setRejectionReason('');
                          }}
                          className="w-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-black py-2.5 rounded-xl transition-colors cursor-pointer shadow-xs"
                        >
                          {isAr ? 'رفض الطلب وإرجاع المبلغ' : 'Reject & Refund'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PayoutsSection;

import React from 'react';
import { useApp } from '../context/AppContext';

export const AdminPanel: React.FC = () => {
  const { users, currentUser, subscribeUser, setUsers, addNotification, language } = useApp();
  const isAr = language === 'ar';

  // Filter users who have uploaded payment proof and are waiting for admin review
  const pendingRequests = users.filter(u => u.paymentProofImage);

  const handleApprove = (userId: string) => {
    // Approve the subscription
    const targetUser = users.find(u => u.id === userId);
    if (targetUser) {
      // Clear paymentProofImage once approved/processed to remove from screen listing
      setUsers(prev => prev.map(u => {
        if (u.id === userId) {
          return { ...u, subscriptionStatus: 'active', paymentProofImage: undefined };
        }
        return u;
      }));
      addNotification(
        isAr ? '✅ تم تفعيل الاشتراك' : '✅ Subscription Approved',
        isAr ? `تم تفعيل اشتراك ${targetUser.name} بنجاح.` : `Activated subscription pass for ${targetUser.name} successfully.`,
        'win'
      );
    }
  };

  const handleReject = (userId: string) => {
    // Reject subscription logic (clearing payment proof)
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        return { ...u, subscriptionStatus: 'none', paymentProofImage: undefined };
      }
      return u;
    }));
    addNotification(
      isAr ? '❌ تم رفض الاشتراك' : '❌ Subscription Rejected',
      isAr ? 'تم رفض إيصال الدفع وجار إشعار المستخدم.' : 'Subscription payment proof was rejected.',
      'error'
    );
  };

  if (!currentUser || currentUser.role !== 'admin') {
    return null;
  }

  return (
    <div className="bg-white border border-[#E5E5E5] rounded-2xl p-5 flex flex-col shadow transition-all overflow-hidden font-sans">
      <div className="text-sm font-bold mb-4 flex items-center justify-between border-b border-zinc-200 pb-2 text-zinc-900">
        <span>{isAr ? 'طلبات الاشتراكات' : 'Subscription Requests'}</span>
        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
          {pendingRequests.length}
        </span>
      </div>

      <div className="space-y-4 overflow-y-auto flex-1 scrollbar-none font-sans">
        {pendingRequests.length === 0 ? (
          <div className="text-xs text-zinc-500 text-center py-10">
            {isAr 
              ? 'لا توجد طلبات اشتراك معلقة حالياً.' 
              : 'No pending subscriptions at the moment. Try to register a new user to test it!'}
          </div>
        ) : (
          pendingRequests.map((u) => (
            <div key={u.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-250 space-y-3">
              <div className="flex justify-between items-center text-[11px] font-bold text-zinc-800">
                <span>{u.name}</span>
                <span className="text-[#FF6B00] text-[9px] font-black uppercase">
                  {isAr ? 'قيد التدقيق' : 'Pending'}
                </span>
              </div>

              {/* Transfer Details */}
              <div className="bg-white border border-zinc-200 p-2.5 rounded-lg text-[11px] space-y-1">
                <div>
                  <span className="font-extrabold text-zinc-500">{isAr ? 'اسم المحول: ' : 'Transfer Name: '}</span>
                  <span className="font-bold text-zinc-900">{u.transferFullName || 'N/A'}</span>
                </div>
                <div>
                  <span className="font-extrabold text-zinc-500">{isAr ? 'هاتف المحول: ' : 'Transfer Phone: '}</span>
                  <span className="font-mono font-bold text-zinc-900">{u.transferPhone || 'N/A'}</span>
                </div>
              </div>
              
              {/* Full-width interactive preview replacing Mock placeholder */}
              <div className="w-full rounded-lg overflow-hidden border border-zinc-200 bg-white">
                <img 
                  src={u.paymentProofImage} 
                  alt={isAr ? 'إيصال الدفع المرفوع' : 'Payment Screenshot'} 
                  className="w-full h-auto object-contain max-h-56 select-all pointer-events-auto" 
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={() => handleApprove(u.id)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  {isAr ? 'قبول واعتماد' : 'Approve'}
                </button>
                <button
                  onClick={() => handleReject(u.id)}
                  className="flex-1 bg-red-50 hover:bg-red-100 border border-red-250 text-red-700 font-bold text-[10px] py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  {isAr ? 'رفض' : 'Reject'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminPanel;

import React from 'react';
import { Users } from 'lucide-react';
import { AdminListSkeleton, EmptyState } from '../FeedbackStates';

/**
 * Members (reference tab): the account-privilege moderation list —
 * behavior-preserving extraction of the former `users` tab body. Purely
 * presentational; the three moderation actions invoke the injected handlers
 * verbatim: `onVerifySeller` (=`verifySeller`), `onBan` (=`banUser`),
 * `onUnban` (=`unbanUser`). Creates NO Firestore listeners.
 */
export interface MembersSectionProps {
  isAr: boolean;
  isLoading: boolean;
  users: any[];
  onVerifySeller: (userId: string) => void; // verifySeller
  onBan: (userId: string) => void; // banUser
  onUnban: (userId: string) => void; // unbanUser
}

export const MembersSection: React.FC<MembersSectionProps> = ({
  isAr,
  isLoading,
  users,
  onVerifySeller,
  onBan,
  onUnban,
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-xs">
        <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-[#FF6B00]" />
          {isAr ? 'سجل الأعضاء وإدارة الصلاحيات' : 'MEMBERS PRIVILEGE CONTROL'}
        </h3>
        <p className="text-[11px] text-gray-400 mt-1">
          {isAr ? 'عاين حسابات المشتركين وقم بتوثيق حساباتهم كبائعين معتمدين أو فرض حظر مؤقت للمخالفين.' : 'Verify user identities to certify authentic merchants or apply bidding limitations.'}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="p-4">
            <AdminListSkeleton />
          </div>
        ) : users.length > 0 ? (
          users.map((profile) => (
          <div key={profile.id} className="p-4 flex justify-between items-center gap-4 transition-colors hover:bg-gray-50/40">
            <div className="flex items-center gap-3">
              <img
                src={profile.avatar}
                alt="Avatar"
                className="w-10 h-10 rounded-xl object-cover shrink-0 border border-gray-200 shadow-xs"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-xs text-gray-900 leading-none">{profile.name}</h4>
                  {profile.role === 'admin' && (
                    <span className="bg-purple-50 text-purple-700 border border-purple-100 text-[8.5px] font-black px-1.5 py-0.5 rounded font-mono">
                      {isAr ? 'إدارة' : 'ADMIN'}
                    </span>
                  )}
                  {profile.isVerified && (
                    <span className="bg-emerald-50 text-emerald-805 border border-emerald-100 text-[8.5px] font-black px-1.5 py-0.5 rounded">
                      {isAr ? 'موثق ✓' : 'VERIFIED ✓'}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1 font-mono">
                  {profile.email} • {profile.city || 'Jordan'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {profile.role === 'user' && !profile.isVerified && (
                <button
                  onClick={() => onVerifySeller(profile.id)}
                  className="bg-emerald-600 font-extrabold hover:bg-emerald-700 text-white text-[10px] px-3 py-1.5 rounded-xl transition-all shadow-xs"
                >
                  {isAr ? 'توثيق العضوية' : 'VERIFY'}
                </button>
              )}

              {profile.isBlocked ? (
                <button
                  onClick={() => onUnban(profile.id)}
                  className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-3 py-1.5 rounded-xl hover:bg-emerald-100 transition-all"
                >
                  {isAr ? 'فك الحظر' : 'UNBAN'}
                </button>
              ) : (
                <button
                  onClick={() => onBan(profile.id)}
                  className="bg-red-50 text-red-650 border border-red-100 text-[10px] font-bold px-3 py-1.5 rounded-xl hover:bg-red-100 transition-all"
                >
                  {isAr ? 'حظر العضوية' : 'BAN'}
                </button>
              )}
            </div>
          </div>
        ))
      ) : (
        <EmptyState
          title={isAr ? 'لا يوجد أعضاء بعد' : 'No users yet'}
          description={isAr ? 'لم يسجل أي مستخدمين بالمنصة بعد.' : 'No users have registered accounts on the network.'}
          language={isAr ? 'ar' : 'en'}
        />
      )}
    </div>

    </div>
  );
};

export default MembersSection;

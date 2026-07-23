import React from 'react';
import { Eye, ShoppingBag } from 'lucide-react';
import { ContextualHint } from './ContextualHint';

interface MyOrdersListProps {
  isAr: boolean;
  myBuyerOrders: any[];
  setSelectedOrderId: (id: string | null) => void;
}

export const MyOrdersList: React.FC<MyOrdersListProps> = ({
  isAr,
  myBuyerOrders,
  setSelectedOrderId
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5 uppercase font-mono">
          <span>{isAr ? 'طلبات الشراء الخاصة بي' : 'MY BUYING ORDERS'}</span>
        </h3>
        <span className="text-[10px] bg-[#FF8000]/10 text-[#FF8000] border border-[#FF8000]/20 font-mono font-black px-2.5 py-0.5 rounded-full">
          {myBuyerOrders.length} {isAr ? 'طلبات' : 'Orders'}
        </span>
      </div>

      {myBuyerOrders.length > 0 && (
        <ContextualHint
          hintKey="first_winning"
          titleAr="مبروك الفوز بمزادك الأول! 🏆"
          titleEn="Congratulations on Your First Win! 🏆"
          descAr="مبروك الفوز بمزادك الأول! أكمل الدفع عبر كليك، ومزاد بيحتفظ بمبلغك وما بيحوّله للبائع إلا بعد ما تستلم القطعة وتتأكد إنها مطابقة."
          descEn="Congratulations on your first win! Complete your payment via CliQ — Mazad holds it and only releases it to the seller after you receive the item and confirm it matches."
          className="bg-zinc-900 border-zinc-800 text-zinc-300"
        />
      )}

      {myBuyerOrders.length > 0 ? (
        <div className="space-y-4">
          {myBuyerOrders.map((order) => {
            const formattedDate = order.createdAt 
              ? new Date(order.createdAt?.seconds ? order.createdAt.seconds * 1000 : order.createdAt).toLocaleDateString(isAr ? 'ar-JO' : 'en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })
              : '';

            return (
              <div 
                key={order.id} 
                className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-3xl p-5 space-y-4 relative overflow-hidden"
              >
                {/* Header info */}
                <div className="flex gap-4 items-start">
                  <img 
                    src={order.auctionImage || 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=300&q=80'} 
                    alt={order.auctionTitle} 
                    className="w-16 h-16 rounded-2xl object-cover border border-[#2A2A2A]"
                    referrerPolicy="no-referrer"
                  />
                  <div className="space-y-1 min-w-0 flex-1">
                    <h4 className="font-black text-white text-sm truncate leading-snug">
                      {order.auctionTitle}
                    </h4>
                    <p className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                      <span>ID:</span>
                      <span className="font-bold select-all text-zinc-300">{order.id.substring(0, 10).toUpperCase()}</span>
                      {formattedDate && (
                        <>
                          <span className="text-zinc-600">•</span>
                          <span>{formattedDate}</span>
                        </>
                      )}
                    </p>
                    <div className="text-base font-black text-[#FF8000] font-mono mt-1">
                      {order.winningBidAmount.toLocaleString()} <span className="text-[10px] font-sans font-bold text-zinc-400">JOD</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#2A2A2A] my-1" />

                {/* Grid stats */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#1F1F1F] p-2.5 rounded-2xl border border-[#2A2A2A] space-y-0.5">
                    <span className="text-[9px] text-zinc-500 font-mono uppercase block font-black">{isAr ? 'حالة الطلب' : 'ORDER STATUS'}</span>
                    <span className={`font-black text-[10.5px] uppercase ${
                      order.status === 'completed' ? 'text-emerald-400' : 'text-[#FF8000]'
                    }`}>
                      {order.status === 'waiting_payment' ? (isAr ? 'بانتظار الدفع' : 'Waiting Payment') :
                       order.status === 'paid' ? (isAr ? 'تم الدفع' : 'Paid') :
                       order.status === 'preparing_shipment' ? (isAr ? 'جاري التجهيز' : 'Preparing Shipment') :
                       order.status === 'shipped' ? (isAr ? 'تم الشحن' : 'Shipped') :
                       order.status === 'delivered' ? (isAr ? 'تم التوصيل' : 'Delivered') :
                       order.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') :
                       order.status === 'disputed' ? (isAr ? 'متنازع عليه' : 'Disputed') : order.status}
                    </span>
                  </div>

                  <div className="bg-[#1F1F1F] p-2.5 rounded-2xl border border-[#2A2A2A] space-y-0.5">
                    <span className="text-[9px] text-zinc-500 font-mono uppercase block font-black">{isAr ? 'حالة الدفع' : 'PAYMENT'}</span>
                    <span className={`font-black text-[10.5px] uppercase ${
                      order.paymentStatus === 'paid' ? 'text-emerald-400' : 'text-amber-500'
                    }`}>
                      {order.paymentStatus === 'paid' ? (isAr ? 'مدفوع' : 'Paid') : (isAr ? 'غير مدفوع' : 'Unpaid')}
                    </span>
                  </div>

                  <div className="bg-[#1F1F1F] p-2.5 rounded-2xl border border-[#2A2A2A] space-y-0.5">
                    <span className="text-[9px] text-[#FF8000] font-mono uppercase block font-black">{isAr ? 'الشحن والتوصيل' : 'SHIPPING'}</span>
                    <span className="font-black text-zinc-300 text-[10.5px] uppercase">
                      {order.shippingStatus === 'not_started' ? (isAr ? 'لم يبدأ بعد' : 'Not Started') :
                       order.shippingStatus === 'preparing' ? (isAr ? 'قيد التجهيز' : 'Preparing') :
                       order.shippingStatus === 'shipped' ? (isAr ? 'تم الشحن' : 'Shipped') :
                       order.shippingStatus === 'delivered' ? (isAr ? 'تم التوصيل' : 'Delivered') : order.shippingStatus}
                    </span>
                  </div>

                  <div className="bg-[#1F1F1F] p-2.5 rounded-2xl border border-[#2A2A2A] space-y-0.5">
                    <span className="text-[9px] text-zinc-500 font-mono uppercase block font-black">{isAr ? 'المبلغ المحجوز' : 'ESCROW STATUS'}</span>
                    <span className={`font-black text-[10.5px] uppercase ${
                      order.escrowStatus === 'released' ? 'text-emerald-400' : 'text-blue-400'
                    }`}>
                      {order.escrowStatus === 'pending' ? (isAr ? 'مبلغ محجوز' : 'Held in Escrow') :
                       order.escrowStatus === 'released' ? (isAr ? 'تم إرساله للبائع' : 'Released to Seller') :
                       order.escrowStatus === 'refunded' ? (isAr ? 'تمت الإعادة لك' : 'Refunded to Buyer') : order.escrowStatus}
                    </span>
                  </div>
                </div>

                {/* View Details button */}
                <button
                  onClick={() => setSelectedOrderId(order.id)}
                  className={`w-full font-black py-3 rounded-2xl text-xs transition-all tracking-wider flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] ${
                    order.status === 'waiting_payment'
                      ? 'bg-[#FF8000] hover:bg-orange-600 text-white shadow-md'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-[#333] hover:border-[#FF8000]'
                  }`}
                  id={`btn-view-buyer-order-${order.id}`}
                >
                  <Eye className="w-4 h-4" />
                  <span>{isAr ? 'عرض التفاصيل والدفع' : 'View Order Details'}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-[#1A1A1A] rounded-3xl border border-[#2A2A2A] p-6">
          <div className="w-12 h-12 rounded-full bg-[#2A2A2A] flex items-center justify-center text-zinc-400 border border-[#333] mx-auto mb-3">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <p className="font-extrabold text-white text-xs uppercase tracking-wide">
            {isAr ? 'لا يوجد طلبات شراء حالية' : 'No Orders Yet'}
          </p>
          <p className="text-[10px] text-zinc-400 leading-relaxed mt-1.5 max-w-[280px] mx-auto">
            {isAr 
              ? 'عند فوزك بمزاد وإنهائه بنجاح، ستظهر تفاصيل الدفع والاستلام الفوري هنا مباشرة.' 
              : 'When you win an auction and it concludes successfully, your payment and tracking cards appear here.'}
          </p>
        </div>
      )}
    </div>
  );
};

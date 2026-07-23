import React from 'react';
import { Eye, Package } from 'lucide-react';

interface SoldOrdersListProps {
  isAr: boolean;
  mySellerOrders: any[];
  setSelectedOrderId: (id: string | null) => void;
}

export const SoldOrdersList: React.FC<SoldOrdersListProps> = ({
  isAr,
  mySellerOrders,
  setSelectedOrderId
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5 uppercase font-mono">
          <span>{isAr ? 'المنتجات المباعة والطلبات' : 'SOLD ORDERS'}</span>
        </h3>
        <span className="text-[10px] bg-[#FF8000]/10 text-[#FF8000] border border-[#FF8000]/20 font-mono font-black px-2.5 py-0.5 rounded-full">
          {mySellerOrders.length} {isAr ? 'مبيعات' : 'Sales'}
        </span>
      </div>

      {mySellerOrders.length > 0 ? (
        <div className="space-y-4">
          {mySellerOrders.map((order) => {
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
                    <div className="text-xs text-zinc-400 font-bold mt-1">
                      {isAr ? 'المشتري:' : 'Buyer:'} <span className="text-white font-black">{order.buyerName}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#2A2A2A] my-1" />

                {/* Grid stats */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#1F1F1F] p-2.5 rounded-2xl border border-[#2A2A2A] space-y-0.5 col-span-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-zinc-500 font-mono uppercase block font-black">{isAr ? 'مبلغ المزايدة الرابحة' : 'WINNING BID AMOUNT'}</span>
                      <span className="text-sm font-black text-[#FF8000] font-mono">
                        {order.winningBidAmount.toLocaleString()} JOD
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#1F1F1F] p-2.5 rounded-2xl border border-[#2A2A2A] space-y-0.5">
                    <span className="text-[9px] text-zinc-500 font-mono uppercase block font-black">{isAr ? 'حالة الدفع' : 'PAYMENT STATUS'}</span>
                    <span className={`font-black text-[10.5px] uppercase ${
                      order.paymentStatus === 'paid' ? 'text-emerald-400' : 'text-amber-500'
                    }`}>
                      {order.paymentStatus === 'paid' ? (isAr ? 'مدفوع (مضمون)' : 'Paid (Held)') : (isAr ? 'غير مدفوع' : 'Unpaid')}
                    </span>
                  </div>

                  <div className="bg-[#1F1F1F] p-2.5 rounded-2xl border border-[#2A2A2A] space-y-0.5">
                    <span className="text-[9px] text-zinc-500 font-mono uppercase block font-black">{isAr ? 'الشحن والتسليم' : 'SHIPPING STATUS'}</span>
                    <span className="font-black text-zinc-300 text-[10.5px] uppercase">
                      {order.shippingStatus === 'not_started' ? (isAr ? 'لم يبدأ بعد' : 'Not Started') :
                       order.shippingStatus === 'preparing' ? (isAr ? 'قيد التجهيز' : 'Preparing') :
                       order.shippingStatus === 'shipped' ? (isAr ? 'تم الشحن' : 'Shipped') :
                       order.shippingStatus === 'delivered' ? (isAr ? 'تم التوصيل' : 'Delivered') : order.shippingStatus}
                    </span>
                  </div>

                  <div className="bg-[#1F1F1F] p-2.5 rounded-2xl border border-[#2A2A2A] space-y-0.5 col-span-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-zinc-500 font-mono uppercase block font-black">{isAr ? 'حالة الطلب الإجمالية' : 'OVERALL STATUS'}</span>
                      <span className={`font-black text-[10.5px] uppercase ${
                        order.status === 'completed' ? 'text-emerald-400' : 'text-[#FF8000]'
                      }`}>
                        {order.status === 'waiting_payment' ? (isAr ? 'بانتظار الدفع' : 'Waiting Payment') :
                         order.status === 'paid' ? (isAr ? 'تم الدفع' : 'Paid') :
                         order.status === 'preparing_shipment' ? (isAr ? 'جاري تجهيز الشحن' : 'Preparing Shipment') :
                         order.shippingStatus === 'shipped' ? (isAr ? 'تم الشحن' : 'Shipped') :
                         order.shippingStatus === 'delivered' ? (isAr ? 'تم التوصيل' : 'Delivered') :
                         order.status === 'completed' ? (isAr ? 'مكتمل' : 'Completed') :
                         order.status === 'disputed' ? (isAr ? 'نزاع قائم' : 'Disputed') : order.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* View Details button */}
                <button
                  onClick={() => setSelectedOrderId(order.id)}
                  className={`w-full font-black py-3 rounded-2xl text-xs transition-all tracking-wider flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] ${
                    order.paymentStatus === 'paid' && order.shippingStatus === 'not_started'
                      ? 'bg-[#FF8000] hover:bg-orange-600 text-white shadow-md'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-[#333] hover:border-[#FF8000]'
                  }`}
                  id={`btn-view-seller-order-${order.id}`}
                >
                  <Eye className="w-4 h-4" />
                  <span>{isAr ? 'عرض تفاصيل الطلب والدفع' : 'View Order Details'}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-[#1A1A1A] rounded-3xl border border-[#2A2A2A] p-6">
          <div className="w-12 h-12 rounded-full bg-[#2A2A2A] flex items-center justify-center text-zinc-400 border border-[#333] mx-auto mb-3">
            <Package className="w-5 h-5" />
          </div>
          <p className="font-extrabold text-white text-xs uppercase tracking-wide">
            {isAr ? 'لا يوجد مبيعات بعد' : 'No Sold Orders Yet'}
          </p>
          <p className="text-[10px] text-zinc-400 leading-relaxed mt-1.5 max-w-[280px] mx-auto">
            {isAr 
              ? 'عند رسو مزاداتك على فائز حقيقي، ستظهر تفاصيل وحالة الدفع والشحن في هذا التبويب فوراً.' 
              : 'When your created auctions are won, their post-auction fulfillment processes will be tracked here.'}
          </p>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Eye, Package } from 'lucide-react';
import { getOrderStatusChip, OrderStatusTone } from '../utils/orderStatusGlossary';
import { displayOrderRef } from '../utils/orderRef';

/** Text-colour-only classes per glossary tone — mirrors the old green/orange
 *  split for the overall-status label while sourcing the label centrally. */
const STATUS_TONE_TEXT: Record<OrderStatusTone, string> = {
  neutral: 'text-fg-muted',
  info: 'text-[#FF8000]',
  warning: 'text-[#FF8000]',
  success: 'text-emerald-600',
  danger: 'text-red-600',
};

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
        <h3 className="text-sm font-black text-fg tracking-tight flex items-center gap-1.5 uppercase font-mono">
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

            const statusChip = getOrderStatusChip(order.status, isAr ? 'ar' : 'en');

            return (
              <div 
                key={order.id} 
                className="bg-surface-raised border border-line rounded-3xl p-5 space-y-4 relative overflow-hidden"
              >
                {/* Header info */}
                <div className="flex gap-4 items-start">
                  <img 
                    src={order.auctionImage || 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=300&q=80'} 
                    alt={order.auctionTitle} 
                    className="w-16 h-16 rounded-2xl object-cover border border-line"
                    referrerPolicy="no-referrer"
                  />
                  <div className="space-y-1 min-w-0 flex-1">
                    <h4 className="font-black text-fg text-sm truncate leading-snug">
                      {order.auctionTitle}
                    </h4>
                    <p className="text-[10px] text-fg-muted font-mono flex items-center gap-1">
                      <span>ID:</span>
                      <span className="font-bold select-all text-fg">{displayOrderRef(order)}</span>
                      {formattedDate && (
                        <>
                          <span className="text-gray-300">•</span>
                          <span>{formattedDate}</span>
                        </>
                      )}
                    </p>
                    <div className="text-xs text-fg-muted font-bold mt-1">
                      {isAr ? 'المشتري:' : 'Buyer:'} <span className="text-fg font-black">{order.buyerName}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-line my-1" />

                {/* Grid stats */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-surface-sunken p-2.5 rounded-2xl border border-line space-y-0.5 col-span-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-fg-muted font-mono uppercase block font-black">{isAr ? 'مبلغ المزايدة الرابحة' : 'WINNING BID AMOUNT'}</span>
                      <span className="text-sm font-black text-[#FF8000] font-mono">
                        {order.winningBidAmount.toLocaleString()} JOD
                      </span>
                    </div>
                  </div>

                  <div className="bg-surface-sunken p-2.5 rounded-2xl border border-line space-y-0.5">
                    <span className="text-[9px] text-fg-muted font-mono uppercase block font-black">{isAr ? 'حالة الدفع' : 'PAYMENT STATUS'}</span>
                    <span className={`font-black text-[10.5px] uppercase ${
                      order.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-500'
                    }`}>
                      {order.paymentStatus === 'paid' ? (isAr ? 'مدفوع (محجوز)' : 'Paid (Held)') : (isAr ? 'غير مدفوع' : 'Unpaid')}
                    </span>
                  </div>

                  <div className="bg-surface-sunken p-2.5 rounded-2xl border border-line space-y-0.5">
                    <span className="text-[9px] text-fg-muted font-mono uppercase block font-black">{isAr ? 'الشحن والتسليم' : 'SHIPPING STATUS'}</span>
                    <span className="font-black text-fg text-[10.5px] uppercase">
                      {order.shippingStatus === 'not_started' ? (isAr ? 'لم يبدأ بعد' : 'Not Started') :
                       order.shippingStatus === 'preparing' ? (isAr ? 'قيد التجهيز' : 'Preparing') :
                       order.shippingStatus === 'shipped' ? (isAr ? 'تم الشحن' : 'Shipped') :
                       order.shippingStatus === 'delivered' ? (isAr ? 'تم التوصيل' : 'Delivered') : order.shippingStatus}
                    </span>
                  </div>

                  <div className="bg-surface-sunken p-2.5 rounded-2xl border border-line space-y-0.5 col-span-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-fg-muted font-mono uppercase block font-black">{isAr ? 'حالة الطلب الإجمالية' : 'OVERALL STATUS'}</span>
                      <span className={`font-black text-[10.5px] uppercase ${STATUS_TONE_TEXT[statusChip.tone]}`}>
                        {statusChip.label}
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
                      : 'bg-surface-sunken hover:bg-gray-200 text-fg border border-line hover:border-[#FF8000]'
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
        <div className="text-center py-12 bg-surface-raised rounded-3xl border border-line p-6">
          <div className="w-12 h-12 rounded-full bg-surface-sunken flex items-center justify-center text-fg-muted border border-line mx-auto mb-3">
            <Package className="w-5 h-5" />
          </div>
          <p className="font-extrabold text-fg text-xs uppercase tracking-wide">
            {isAr ? 'لا يوجد مبيعات بعد' : 'No Sold Orders Yet'}
          </p>
          <p className="text-[10px] text-fg-muted leading-relaxed mt-1.5 max-w-[280px] mx-auto">
            {isAr 
              ? 'عند رسو مزاداتك على فائز حقيقي، ستظهر تفاصيل وحالة الدفع والشحن في هذا التبويب فوراً.' 
              : 'When your created auctions are won, their post-auction fulfillment processes will be tracked here.'}
          </p>
        </div>
      )}
    </div>
  );
};

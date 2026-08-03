import React from 'react';
import { Eye, ShoppingBag } from 'lucide-react';
import { ContextualHint } from './ContextualHint';
import { getOrderStatusChip, OrderStatusTone } from '../utils/orderStatusGlossary';
import { displayOrderRef } from '../utils/orderRef';

/** Text-colour-only classes per glossary tone — the old inline label used a
 *  green/orange split; this preserves that while sourcing the label centrally. */
const STATUS_TONE_TEXT: Record<OrderStatusTone, string> = {
  neutral: 'text-fg-muted',
  info: 'text-[#FF8000]',
  warning: 'text-[#FF8000]',
  success: 'text-emerald-600',
  danger: 'text-red-600',
};

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
        <h3 className="text-sm font-black text-fg tracking-tight flex items-center gap-1.5 uppercase font-mono">
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
          className="bg-accent-weak/70 border-orange-100 text-fg"
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

            const statusChip = getOrderStatusChip(order.status, isAr ? 'ar' : 'en');

            return (
              <div
                key={order.id}
                className="bg-surface-raised border border-line rounded-3xl p-5 space-y-4 relative overflow-hidden"
              >
                {/* Header info */}
                <div className="flex gap-4 items-start">
                  <img
                    src={order.auctionImage || ''}
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
                    <div className="text-base font-black text-[#FF8000] font-mono mt-1">
                      {order.winningBidAmount.toLocaleString()} <span className="text-[10px] font-sans font-bold text-fg-muted">JOD</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-line my-1" />

                {/* Grid stats */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-surface-sunken p-2.5 rounded-2xl border border-line space-y-0.5">
                    <span className="text-[9px] text-fg-muted font-mono uppercase block font-black">{isAr ? 'حالة الطلب' : 'ORDER STATUS'}</span>
                    <span className={`font-black text-[10.5px] uppercase ${STATUS_TONE_TEXT[statusChip.tone]}`}>
                      {statusChip.label}
                    </span>
                  </div>

                  <div className="bg-surface-sunken p-2.5 rounded-2xl border border-line space-y-0.5">
                    <span className="text-[9px] text-fg-muted font-mono uppercase block font-black">{isAr ? 'حالة الدفع' : 'PAYMENT'}</span>
                    <span className={`font-black text-[10.5px] uppercase ${
                      order.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-500'
                    }`}>
                      {order.paymentStatus === 'paid' ? (isAr ? 'مدفوع' : 'Paid') : (isAr ? 'غير مدفوع' : 'Unpaid')}
                    </span>
                  </div>

                  <div className="bg-surface-sunken p-2.5 rounded-2xl border border-line space-y-0.5">
                    <span className="text-[9px] text-[#FF8000] font-mono uppercase block font-black">{isAr ? 'الشحن والتوصيل' : 'SHIPPING'}</span>
                    <span className="font-black text-fg text-[10.5px] uppercase">
                      {order.shippingStatus === 'not_started' ? (isAr ? 'لم يبدأ بعد' : 'Not Started') :
                       order.shippingStatus === 'preparing' ? (isAr ? 'قيد التجهيز' : 'Preparing') :
                       order.shippingStatus === 'shipped' ? (isAr ? 'تم الشحن' : 'Shipped') :
                       order.shippingStatus === 'delivered' ? (isAr ? 'تم التوصيل' : 'Delivered') : order.shippingStatus}
                    </span>
                  </div>

                  <div className="bg-surface-sunken p-2.5 rounded-2xl border border-line space-y-0.5">
                    <span className="text-[9px] text-fg-muted font-mono uppercase block font-black">{isAr ? 'المبلغ المحجوز' : 'ESCROW STATUS'}</span>
                    <span className={`font-black text-[10.5px] uppercase ${
                      order.escrowStatus === 'released' ? 'text-emerald-600' : 'text-blue-600'
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
                      : 'bg-surface-sunken hover:bg-gray-200 text-fg border border-line hover:border-[#FF8000]'
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
        <div className="text-center py-12 bg-surface-raised rounded-3xl border border-line p-6">
          <div className="w-12 h-12 rounded-full bg-surface-sunken flex items-center justify-center text-fg-muted border border-line mx-auto mb-3">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <p className="font-extrabold text-fg text-xs uppercase tracking-wide">
            {isAr ? 'لا يوجد طلبات شراء حالية' : 'No Orders Yet'}
          </p>
          <p className="text-[10px] text-fg-muted leading-relaxed mt-1.5 max-w-[280px] mx-auto">
            {isAr 
              ? 'عند فوزك بمزاد وإنهائه بنجاح، ستظهر تفاصيل الدفع والاستلام الفوري هنا مباشرة.' 
              : 'When you win an auction and it concludes successfully, your payment and tracking cards appear here.'}
          </p>
        </div>
      )}
    </div>
  );
};

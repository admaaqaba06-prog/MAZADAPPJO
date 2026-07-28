import React from 'react';
import { Database, FileCheck2 } from 'lucide-react';
import { getOrderStatusChip, OrderStatusTone } from '../../utils/orderStatusGlossary';
import { displayOrderRef } from '../../utils/orderRef';

/** Text-colour-only classes per glossary tone — keeps this ledger's brand-orange
 *  default while the visible label now comes from the shared glossary. */
const STATUS_TONE_TEXT: Record<OrderStatusTone, string> = {
  neutral: 'text-gray-500',
  info: 'text-[#E85D04]',
  warning: 'text-[#E85D04]',
  success: 'text-emerald-600',
  danger: 'text-rose-600',
};

/**
 * Orders ledger (reference tab): the read-only order-fulfillment audit list —
 * behavior-preserving extraction of the former `orders` tab body. Purely
 * presentational: stat chips read `realOrders` (sim-excluded), the filter bar
 * drives the shell-owned `adminOrderFilter` via `onFilterChange`, and each row's
 * "view details" button calls `onOpenOrder` (=`setAdminSelectedOrderId`) which
 * opens the `OrderDetailsView` full-pane overlay that STAYS in the shell.
 * Creates NO Firestore listeners.
 */
export type AdminOrderFilter =
  | 'all'
  | 'waiting_payment'
  | 'paid'
  | 'preparing_shipment'
  | 'out_for_delivery'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'defaulted';

export interface OrdersLedgerSectionProps {
  isAr: boolean;
  orders: any[]; // full orders list (incl. sim) — powers the filter-bar counts
  filteredOrders: any[];
  realOrders: any[]; // sim-excluded — powers the stat chips
  simOrdersCount: number;
  adminOrderFilter: AdminOrderFilter;
  onFilterChange: (filter: AdminOrderFilter) => void; // setAdminOrderFilter
  onOpenOrder: (orderId: string) => void; // setAdminSelectedOrderId
}

export const OrdersLedgerSection: React.FC<OrdersLedgerSectionProps> = ({
  isAr,
  orders,
  filteredOrders,
  realOrders,
  simOrdersCount,
  adminOrderFilter,
  onFilterChange,
  onOpenOrder,
}) => {
  return (
    <div className="space-y-4">
      {/* Header and Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl border border-gray-200">
        <div className="space-y-1">
          <h3 className="text-lg font-black text-gray-900">{isAr ? 'نظام تتبع وإدارة الطلبات' : 'Order Fulfillment Ledger'}</h3>
          <p className="text-xs text-gray-500">{isAr ? 'عرض وتتبع جميع عمليات الفوز والطلبات المنبثقة من المزادات المغلقة.' : 'Audit and track all won listings, escrow transactions, and shipping states.'}</p>
        </div>
        <div className="flex gap-2.5">
          {/* Wave 3: stat chips are REAL metrics — sim orders excluded;
              the ledger list below still shows them while the simulator
              is ON, so TOTAL notes how many are simulated. */}
          <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl text-center min-w-[100px]">
            <span className="text-[10px] text-gray-400 font-mono uppercase block font-black">{isAr ? 'إجمالي الطلبات' : 'TOTAL'}</span>
            <span className="text-lg font-black text-gray-900 font-mono">{realOrders.length}</span>
            {simOrdersCount > 0 && (
              <span className="text-[9px] text-violet-500 font-mono block font-bold">
                +{simOrdersCount} 🧪 sim
              </span>
            )}
          </div>
          <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-center min-w-[100px]">
            <span className="text-[10px] text-amber-500 font-mono uppercase block font-black">{isAr ? 'بانتظار الدفع' : 'UNPAID'}</span>
            <span className="text-lg font-black text-amber-700 font-mono">
              {realOrders.filter((o: any) => o.status === 'waiting_payment').length}
            </span>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center min-w-[100px]">
            <span className="text-[10px] text-emerald-500 font-mono uppercase block font-black">{isAr ? 'مكتمل' : 'COMPLETED'}</span>
            <span className="text-lg font-black text-emerald-700 font-mono">
              {realOrders.filter((o: any) => o.status === 'completed').length}
            </span>
          </div>
        </div>
      </div>

      {/* Filter buttons bar */}
      <div className="bg-white p-2 rounded-2xl border border-gray-200 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {(['all', 'waiting_payment', 'paid', 'preparing_shipment', 'out_for_delivery', 'shipped', 'delivered', 'completed', 'disputed', 'defaulted'] as const).map((filterOpt) => {
          const label = isAr
            ? (filterOpt === 'all' ? 'الكل' :
               filterOpt === 'waiting_payment' ? 'بانتظار الدفع' :
               filterOpt === 'paid' ? 'مدفوع' :
               filterOpt === 'preparing_shipment' ? 'تجهيز الشحن' :
               filterOpt === 'out_for_delivery' ? 'خرج للتوصيل' :
               filterOpt === 'shipped' ? 'تم الشحن' :
               filterOpt === 'delivered' ? 'تم التوصيل' :
               filterOpt === 'completed' ? 'مكتمل' :
               filterOpt === 'disputed' ? 'نزاع' : 'متخلف عن الدفع')
            : (filterOpt === 'all' ? 'ALL ORDERS' :
               filterOpt === 'waiting_payment' ? 'WAITING PAYMENT' :
               filterOpt === 'paid' ? 'PAID' :
               filterOpt === 'preparing_shipment' ? 'PREPARING SHIPMENT' :
               filterOpt === 'out_for_delivery' ? 'OUT FOR DELIVERY' :
               filterOpt === 'shipped' ? 'SHIPPED' :
               filterOpt === 'delivered' ? 'DELIVERED' :
               filterOpt === 'completed' ? 'COMPLETED' :
               filterOpt === 'disputed' ? 'DISPUTED' : 'DEFAULTED');

          const isSelected = adminOrderFilter === filterOpt;
          const count = filterOpt === 'all' ? (orders?.length || 0) : (orders?.filter((o: any) => o.status === filterOpt).length || 0);

          return (
            <button
              key={filterOpt}
              onClick={() => onFilterChange(filterOpt)}
              className={`px-3 py-2 rounded-xl text-[11px] font-black tracking-tight whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-[#E85D04] text-white shadow-sm shadow-[#E85D04]/15'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span>{label}</span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full font-black ${
                isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders list rendering */}
      {filteredOrders.length > 0 ? (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredOrders.map((order: any) => {
            const formattedDate = order.createdAt
              ? new Date(order.createdAt?.seconds ? order.createdAt.seconds * 1000 : order.createdAt).toLocaleString(isAr ? 'ar-JO' : 'en-US')
              : '';

            const statusChip = getOrderStatusChip(order.status, isAr ? 'ar' : 'en');

            return (
              <div
                key={order.id}
                className="bg-white border border-gray-200 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all space-y-4 relative overflow-hidden"
              >
                {/* Left vertical neon status tag depending on order state */}
                <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                  order.status === 'completed' ? 'bg-emerald-500' :
                  order.status === 'disputed' ? 'bg-rose-500' : 'bg-[#E85D04]'
                }`} />

                <div className="flex gap-3 items-start pl-2">
                  <img
                    src={order.auctionImage || 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=300&q=80'}
                    alt={order.auctionTitle}
                    className="w-12 h-12 rounded-2xl object-cover border border-gray-100"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h4 className="font-black text-gray-900 text-xs truncate leading-snug">{order.auctionTitle}</h4>
                    <p className="text-[10px] text-gray-400 font-mono">
                      ID: <span className="font-bold select-all">{displayOrderRef(order)}</span>
                    </p>
                    {formattedDate && (
                      <p className="text-[9px] text-gray-400 font-mono">{formattedDate}</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-100 my-1 pl-2" />

                <div className="grid grid-cols-2 gap-2 text-[10.5px] pl-2">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-gray-400 font-mono block uppercase">{isAr ? 'البائع والمزكّي' : 'SELLER'}</span>
                    <span className="font-extrabold text-gray-800">{order.sellerName}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-gray-400 font-mono block uppercase">{isAr ? 'المشتري الفائز' : 'WINNING BUYER'}</span>
                    <span className="font-extrabold text-gray-800">{order.buyerName}</span>
                  </div>
                  <div className="space-y-0.5 mt-2">
                    <span className="text-[9px] text-gray-400 font-mono block uppercase">{isAr ? 'القيمة والمبلغ' : 'BID AMOUNT'}</span>
                    <span className="font-black text-[#E85D04] font-mono">{order.winningBidAmount.toLocaleString()} JOD</span>
                  </div>
                  <div className="space-y-0.5 mt-2">
                    <span className="text-[9px] text-gray-400 font-mono block uppercase">{isAr ? 'الضمان المالي' : 'ESCROW STATE'}</span>
                    <span className={`font-black uppercase ${
                      order.escrowStatus === 'released' ? 'text-emerald-650' : 'text-blue-650'
                    }`}>
                      {order.escrowStatus === 'pending' ? (isAr ? 'محتجز بالضمان' : 'Held in Escrow') :
                       order.escrowStatus === 'released' ? (isAr ? 'تم التحرير للبائع' : 'Released') :
                       order.escrowStatus === 'refunded' ? (isAr ? 'تمت الإعادة للمشتري' : 'Refunded') : order.escrowStatus}
                    </span>
                  </div>
                </div>

                <div className="bg-[#FAF9F6] p-3 rounded-2xl border border-gray-100 flex justify-between items-center text-[10px] pl-2 ml-2">
                  <div className="space-y-0.5">
                    <span className="text-[8.5px] text-gray-400 font-mono uppercase block">{isAr ? 'الدفع' : 'PAYMENT'}</span>
                    <span className={`font-black ${order.paymentStatus === 'paid' ? 'text-emerald-650' : 'text-amber-600'}`}>
                      {order.paymentStatus === 'paid' ? (isAr ? 'مدفوع' : 'PAID') : (isAr ? 'غير مدفوع' : 'UNPAID')}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[8.5px] text-gray-400 font-mono uppercase block">{isAr ? 'الشحن والتوزيع' : 'SHIPPING'}</span>
                    <span className="font-black text-gray-700">
                      {order.shippingStatus === 'not_started' ? (isAr ? 'لم يبدأ بعد' : 'NOT STARTED') :
                       order.shippingStatus === 'preparing' ? (isAr ? 'قيد التجهيز' : 'PREPARING') :
                       order.shippingStatus === 'shipped' ? (isAr ? 'تم الشحن' : 'SHIPPED') :
                       order.shippingStatus === 'delivered' ? (isAr ? 'تم التوصيل' : 'DELIVERED') : order.shippingStatus}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[8.5px] text-gray-400 font-mono uppercase block">{isAr ? 'الحالة العامة' : 'STATUS'}</span>
                    <span className={`font-black uppercase ${STATUS_TONE_TEXT[statusChip.tone]}`}>
                      {statusChip.label}
                    </span>
                  </div>
                </div>

                {/* View Details / Manage button for Admin */}
                <button
                  onClick={() => onOpenOrder(order.id)}
                  className="w-[calc(100%-8px)] ml-2 bg-gray-50 hover:bg-[#E85D04] hover:text-white text-gray-700 font-black py-2.5 rounded-2xl text-[10.5px] transition-all tracking-wider border border-gray-200 hover:border-[#E85D04] flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono active:scale-[0.99] mt-3"
                  id={`btn-admin-view-order-${order.id}`}
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'عرض التفاصيل والتحكم بالضمان' : 'VIEW DETAILS & MANAGE ESCROW'}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-3xl border border-gray-200 p-6">
          <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 border border-gray-100 mx-auto mb-3">
            <Database className="w-5 h-5 text-gray-400" />
          </div>
          <p className="font-extrabold text-gray-700 text-xs uppercase tracking-wide">
            {isAr ? 'لا يوجد طلبات بهذا الفلتر' : 'No Orders Match Filter'}
          </p>
          <p className="text-[10px] text-gray-400 leading-relaxed mt-1 max-w-[280px] mx-auto">
            {isAr
              ? 'لم يتم العثور على أي طلبات تتبع هذا التبويب حالياً.'
              : 'No orders recorded in this state yet.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default OrdersLedgerSection;

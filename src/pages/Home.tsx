import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Flame, 
  Clock, 
  Diamond, 
  Car, 
  Cpu, 
  Shirt, 
  Home, 
  Gavel, 
  User, 
  Calendar 
} from 'lucide-react';

export interface AuctionItem {
  id: string;
  name: string;
  price: number;
  bids: number;
  timeLeft: string;
  isLive: boolean;
  category: string;
  bgColor: string;
  iconColor: string;
}

export interface EndingSoonItem {
  id: string;
  name: string;
  price: number;
  timeLeft: string;
  bgColor: string;
  iconColor: string;
}

export interface HomeProps {
  onBidClick?: (auctionId: string) => void;
  onSellClick?: () => void;
}

const MOCK_AUCTIONS: AuctionItem[] = [
  { id: '1', name: 'iPhone 15 Pro Max', price: 280, bids: 14, timeLeft: '12:30', isLive: true, category: 'electronics', bgColor: '#1a1a2e', iconColor: '#8888cc' },
  { id: '2', name: 'Vintage Jacket', price: 38, bids: 7, timeLeft: '44:10', isLive: true, category: 'fashion', bgColor: '#0d1b0d', iconColor: '#44aa66' },
  { id: '3', name: 'Rolex Submariner', price: 3200, bids: 31, timeLeft: '1:55:00', isLive: false, category: 'luxury', bgColor: '#1a1208', iconColor: '#cc9944' },
  { id: '4', name: 'MacBook Pro M3', price: 650, bids: 22, timeLeft: '1:25:00', isLive: false, category: 'electronics', bgColor: '#0d1b2a', iconColor: '#6699cc' },
];

const ENDING_SOON: EndingSoonItem[] = [
  { id: '1', name: 'iPhone 15 Pro', price: 280, timeLeft: '55m 50s', bgColor: '#1a1a2e', iconColor: '#8888cc' },
  { id: '2', name: 'MacBook Pro', price: 650, timeLeft: '1h 25m', bgColor: '#0d1b2a', iconColor: '#6699cc' },
  { id: '3', name: 'Rolex Submariner', price: 3200, timeLeft: '1h 55m', bgColor: '#1a1208', iconColor: '#cc9944' },
  { id: '4', name: 'Air Jordan 1', price: 95, timeLeft: '2h 10m', bgColor: '#0d1b0d', iconColor: '#44aa66' },
];

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Flame },
  { id: 'luxury', label: 'Luxury', icon: Diamond },
  { id: 'vehicles', label: 'Vehicles', icon: Car },
  { id: 'electronics', label: 'Electronics', icon: Cpu },
  { id: 'fashion', label: 'Fashion', icon: Shirt },
];

const SUB_TAGS = ["Men's modern & thrift", "Thrift", "Soccer", "Accessories"];

export const HomeView: React.FC<HomeProps> = ({ onBidClick, onSellClick }) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeFeedTab, setActiveFeedTab] = useState<'live' | 'upcoming'>('live');
  const [activeSubTag, setActiveSubTag] = useState<string>("Men's modern & thrift");
  const [isDark, setIsDark] = useState<boolean>(false);

  // Monitor prefers-color-scheme to dynamically change background & text colors
  useEffect(() => {
    const mediaVal = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mediaVal.matches);
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaVal.addEventListener('change', listener);
    return () => mediaVal.removeEventListener('change', listener);
  }, []);

  // Filter local auctions list dynamically based on active category state
  const displayAuctions = MOCK_AUCTIONS.filter(item => {
    if (activeCategory === 'all') return true;
    return item.category === activeCategory;
  });

  const styles = {
    container: {
      maxWidth: '390px',
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: isDark ? '#111111' : '#FFFFFF',
      color: isDark ? '#FFFFFF' : '#111111',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      boxSizing: 'border-box',
      paddingBottom: '88px', // Meticulous safe padding area for bottom action navigation
    } as React.CSSProperties,
    topBar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 16px',
    } as React.CSSProperties,
    topBarLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    } as React.CSSProperties,
    logoMark: {
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      backgroundColor: '#FF6B00',
      color: '#FFFFFF',
      fontWeight: 'bold',
      fontSize: '18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as React.CSSProperties,
    appName: {
      fontSize: '15px',
      fontWeight: 500,
    } as React.CSSProperties,
    topBarRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    } as React.CSSProperties,
    langButton: {
      background: 'none',
      borderStyle: 'solid',
      borderWidth: '0.5px',
      borderRadius: '6px',
      padding: '4px 8px',
      fontSize: '12px',
      cursor: 'pointer',
      fontFamily: 'inherit',
    } as React.CSSProperties,
    sellBtn: {
      background: '#FF6B00',
      border: 'none',
      color: '#FFFFFF',
      borderRadius: '6px',
      padding: '4px 10px',
      fontSize: '12px',
      fontWeight: 500,
      cursor: 'pointer',
      fontFamily: 'inherit',
    } as React.CSSProperties,
    heroBanner: {
      margin: '4px 16px 14px',
      background: '#111111',
      borderRadius: '12px',
      padding: '18px 16px',
      position: 'relative',
      overflow: 'hidden',
    } as React.CSSProperties,
    heroCircle1: {
      position: 'absolute',
      top: '-20px',
      left: '-20px',
      width: '100px',
      height: '100px',
      borderRadius: '50%',
      backgroundColor: 'rgba(255, 107, 0, 0.12)',
    } as React.CSSProperties,
    heroCircle2: {
      position: 'absolute',
      bottom: '-30px',
      right: '-10px',
      width: '120px',
      height: '120px',
      borderRadius: '50%',
      backgroundColor: 'rgba(255, 107, 0, 0.07)',
    } as React.CSSProperties,
    heroEyebrow: {
      fontSize: '10px',
      color: '#FF6B00',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      display: 'block',
      marginBottom: '6px',
      fontWeight: 600,
    } as React.CSSProperties,
    heroTitle: {
      fontSize: '18px',
      color: '#FFFFFF',
      fontWeight: 500,
      lineHeight: 1.3,
      margin: '0 0 6px 0',
      whiteSpace: 'pre-line',
    } as React.CSSProperties,
    heroSubtitle: {
      fontSize: '11px',
      color: 'rgba(255,255,255,0.5)',
      margin: 0,
    } as React.CSSProperties,
    sectionHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 16px',
      marginBottom: '8px',
    } as React.CSSProperties,
    sectionHeaderLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    } as React.CSSProperties,
    redDot: {
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      backgroundColor: '#FF3B30',
    } as React.CSSProperties,
    sectionTitle: {
      fontSize: '12px',
      fontWeight: 500,
    } as React.CSSProperties,
    sectionHeaderRight: {
      fontSize: '11px',
      color: '#888888',
    } as React.CSSProperties,
    endingSoonScroll: {
      display: 'flex',
      gap: '12px',
      overflowX: 'auto',
      padding: '0 16px 4px',
      marginBottom: '16px',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    } as React.CSSProperties,
    endingSoonChip: {
      width: '90px',
      flexShrink: 0,
      textAlign: 'center',
    } as React.CSSProperties,
    endingSoonThumbnail: {
      width: '90px',
      height: '90px',
      borderRadius: '12px',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '6px',
    } as React.CSSProperties,
    timerBadge: {
      position: 'absolute',
      bottom: '4px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(0,0,0,0.72)',
      color: '#FFFFFF',
      fontSize: '9px',
      padding: '2px 6px',
      borderRadius: '99px',
      display: 'flex',
      alignItems: 'center',
      whiteSpace: 'nowrap',
      gap: '2px',
    } as React.CSSProperties,
    endingSoonName: {
      fontSize: '11px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      marginBottom: '2px',
    } as React.CSSProperties,
    endingSoonPrice: {
      fontSize: '10px',
      color: '#FF6B00',
      fontWeight: 500,
    } as React.CSSProperties,
    searchBarContainer: {
      padding: '0 16px',
      marginBottom: '14px',
    } as React.CSSProperties,
    searchBar: {
      borderWidth: '0.5px',
      borderStyle: 'solid',
      borderRadius: '12px',
      padding: '9px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
    } as React.CSSProperties,
    searchIcon: {
      color: '#888888',
    } as React.CSSProperties,
    searchPlaceholder: {
      color: '#888888',
      fontSize: '12px',
    } as React.CSSProperties,
    categoriesScroll: {
      display: 'flex',
      gap: '8px',
      overflowX: 'auto',
      padding: '0 16px 4px',
      marginBottom: '16px',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    } as React.CSSProperties,
    categoryPill: {
      display: 'flex',
      alignItems: 'center',
      padding: '6px 12px',
      borderRadius: '99px',
      borderWidth: '0.5px',
      borderStyle: 'solid',
      fontSize: '12px',
      fontWeight: 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'all 0.2s',
      fontFamily: 'inherit',
    } as React.CSSProperties,
    feedTabsContainer: {
      display: 'flex',
      margin: '0 16px 12px',
      borderBottomWidth: '0.5px',
      borderBottomStyle: 'solid',
    } as React.CSSProperties,
    feedTabBtn: {
      display: 'flex',
      alignItems: 'center',
      padding: '8px 12px',
      fontSize: '12px',
      fontWeight: 500,
      border: 'none',
      borderBottomWidth: '2px',
      borderBottomStyle: 'solid',
      background: 'none',
      cursor: 'pointer',
      marginRight: '8px',
      fontFamily: 'inherit',
    } as React.CSSProperties,
    subTagsScroll: {
      display: 'flex',
      gap: '6px',
      overflowX: 'auto',
      padding: '0 16px 4px',
      marginBottom: '14px',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    } as React.CSSProperties,
    subTagPill: {
      padding: '4px 10px',
      borderRadius: '99px',
      borderWidth: '0.5px',
      borderStyle: 'solid',
      fontSize: '11px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'all 0.2s',
      fontFamily: 'inherit',
    } as React.CSSProperties,
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '10px',
      padding: '0 16px 20px',
    } as React.CSSProperties,
    card: {
      borderWidth: '0.5px',
      borderStyle: 'solid',
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    } as React.CSSProperties,
    cardMedia: {
      height: '130px',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as React.CSSProperties,
    liveBadge: {
      position: 'absolute',
      top: '6px',
      right: '6px',
      backgroundColor: '#FF3B30',
      color: '#FFFFFF',
      fontSize: '9px',
      fontWeight: 'bold',
      padding: '2px 6px',
      borderRadius: '99px',
    } as React.CSSProperties,
    cardTimer: {
      position: 'absolute',
      bottom: '6px',
      right: '6px',
      backgroundColor: 'rgba(0,0,0,0.6)',
      color: '#FFFFFF',
      fontSize: '8px',
      padding: '2px 5px',
      borderRadius: '4px',
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
    } as React.CSSProperties,
    cardBody: {
      padding: '9px 10px',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
    } as React.CSSProperties,
    cardName: {
      fontSize: '12px',
      fontWeight: 500,
      marginBottom: '4px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    } as React.CSSProperties,
    cardRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '7px',
    } as React.CSSProperties,
    cardPrice: {
      fontSize: '13px',
      fontWeight: 500,
      color: '#FF6B00',
    } as React.CSSProperties,
    cardBids: {
      fontSize: '10px',
      color: '#888888',
    } as React.CSSProperties,
    bidNowBtn: {
      backgroundColor: '#FF6B00',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: '8px',
      padding: '6px',
      fontSize: '11px',
      fontWeight: 500,
      cursor: 'pointer',
      width: '100%',
      textAlign: 'center',
      fontFamily: 'inherit',
    } as React.CSSProperties,
    bottomNavBar: {
      position: 'fixed',
      bottom: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: '390px',
      height: '66px',
      backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
      borderTop: `0.5px solid ${isDark ? '#2C2C2E' : '#E5E7EB'}`,
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      zIndex: 100,
      boxSizing: 'border-box',
      padding: '0 8px',
    } as React.CSSProperties,
    navItemActive: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: '4px',
      fontFamily: 'inherit',
    } as React.CSSProperties,
    navItemInactive: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: '4px',
      fontFamily: 'inherit',
    } as React.CSSProperties,
    navLabelActive: {
      fontSize: '9px',
      fontWeight: 'bold',
      color: '#FF6B00',
      marginTop: '2px',
    } as React.CSSProperties,
    navLabelInactive: {
      fontSize: '9px',
      color: '#888888',
      marginTop: '2px',
    } as React.CSSProperties,
    navCenterBtn: {
      width: '46px',
      height: '46px',
      borderRadius: '50%',
      backgroundColor: '#FF6B00',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: '-18px',
      cursor: 'pointer',
      zIndex: 110,
      transition: 'transform 0.1s ease-out',
    } as React.CSSProperties,
  };

  return (
    <div id="mazadjo-redesign-home" style={styles.container}>
      
      {/* 1. TOP BAR */}
      <header style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <div style={styles.logoMark}>M</div>
          <span style={styles.appName}>Mazad Jo</span>
        </div>
        <div style={styles.topBarRight}>
          <button style={{ ...styles.langButton, borderColor: isDark ? '#333333' : '#E5E7EB', color: isDark ? '#CCCCCC' : '#666666' }}>العربية</button>
          <button onClick={onSellClick} style={styles.sellBtn}>+ Sell</button>
        </div>
      </header>

      {/* 2. HERO BANNER */}
      <div style={styles.heroBanner}>
        <div style={styles.heroCircle1} />
        <div style={styles.heroCircle2} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={styles.heroEyebrow}>LIVE AUCTIONS</span>
          <h2 style={styles.heroTitle}>{"Bid. Buy.\nSell — Live."}</h2>
          <p style={styles.heroSubtitle}>Real-time auctions with secure escrow payments.</p>
        </div>
      </div>

      {/* 3. ENDING SOON ROW */}
      <div style={styles.sectionHeader}>
        <div style={styles.sectionHeaderLeft}>
          <div style={styles.redDot} />
          <span style={styles.sectionTitle}>Ending soon</span>
        </div>
        <span style={styles.sectionHeaderRight}>3 live</span>
      </div>

      <div style={styles.endingSoonScroll}>
        {ENDING_SOON.map(item => {
          let IconComp = Cpu;
          if (item.bgColor === '#1a1208') IconComp = Diamond;
          if (item.bgColor === '#0d1b0d') IconComp = Shirt;
          
          return (
            <div key={item.id} style={styles.endingSoonChip}>
              <div style={{ ...styles.endingSoonThumbnail, backgroundColor: item.bgColor }}>
                <IconComp size={32} style={{ color: item.iconColor }} />
                <div style={styles.timerBadge}>
                  <Clock size={8} />
                  <span>{item.timeLeft}</span>
                </div>
              </div>
              <div style={styles.endingSoonName}>{item.name}</div>
              <div style={styles.endingSoonPrice}>{item.price} JOD</div>
            </div>
          );
        })}
      </div>

      {/* 4. SEARCH BAR */}
      <div style={styles.searchBarContainer}>
        <div style={{ ...styles.searchBar, backgroundColor: isDark ? '#222222' : '#F5F5F5', borderColor: isDark ? '#333333' : '#E5E7EB' }}>
          <Search size={16} style={styles.searchIcon} />
          <span style={styles.searchPlaceholder}>Search Rolex, premium land slots...</span>
        </div>
      </div>

      {/* 5. CATEGORY PILLS */}
      <div style={styles.categoriesScroll}>
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id;
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                ...styles.categoryPill,
                backgroundColor: isActive ? '#FF6B00' : 'transparent',
                color: isActive ? '#FFFFFF' : '#888888',
                borderColor: isActive ? '#FF6B00' : isDark ? '#333333' : '#E5E7EB',
              }}
            >
              <Icon size={12} style={{ marginRight: '4px' }} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* 6. FEED TABS */}
      <div style={{ ...styles.feedTabsContainer, borderBottomColor: isDark ? '#333333' : '#E5E7EB' }}>
        <button
          onClick={() => setActiveFeedTab('live')}
          style={{
            ...styles.feedTabBtn,
            color: activeFeedTab === 'live' ? '#FF6B00' : '#888888',
            borderBottomColor: activeFeedTab === 'live' ? '#FF6B00' : 'transparent',
          }}
        >
          <Flame size={12} style={{ marginRight: '4px' }} />
          <span>Active live feed</span>
        </button>
        <button
          onClick={() => setActiveFeedTab('upcoming')}
          style={{
            ...styles.feedTabBtn,
            color: activeFeedTab === 'upcoming' ? '#FF6B00' : '#888888',
            borderBottomColor: activeFeedTab === 'upcoming' ? '#FF6B00' : 'transparent',
          }}
        >
          <Calendar size={12} style={{ marginRight: '4px' }} />
          <span>Upcoming drops</span>
        </button>
      </div>

      {/* 7. SUB-FILTER TAGS */}
      <div style={styles.subTagsScroll}>
        {SUB_TAGS.map(tag => {
          const isActive = activeSubTag === tag;
          return (
            <button
              key={tag}
              onClick={() => setActiveSubTag(tag)}
              style={{
                ...styles.subTagPill,
                backgroundColor: isActive ? (isDark ? '#FFFFFF' : '#111111') : 'transparent',
                color: isActive ? (isDark ? '#111111' : '#FFFFFF') : '#888888',
                borderColor: isActive ? (isDark ? '#FFFFFF' : '#111111') : (isDark ? '#333333' : '#E5E7EB'),
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* 8. AUCTION FEED GRID */}
      {displayAuctions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#888888', fontSize: '12px' }}>
          No auctions found under the selected category.
        </div>
      ) : (
        <div style={styles.grid}>
          {displayAuctions.map(item => {
            let IconComp = Cpu;
            if (item.category === 'luxury') IconComp = Diamond;
            if (item.category === 'fashion') IconComp = Shirt;
            
            return (
              <div key={item.id} style={{ ...styles.card, backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderColor: isDark ? '#2C2C2E' : '#E5E7EB' }}>
                <div style={{ ...styles.cardMedia, backgroundColor: item.bgColor }}>
                  <IconComp size={40} style={{ color: item.iconColor }} />
                  {item.isLive && (
                    <div style={styles.liveBadge}>LIVE</div>
                  )}
                  <div style={styles.cardTimer}>
                    <Clock size={8} />
                    <span>{item.timeLeft}</span>
                  </div>
                </div>
                <div style={styles.cardBody}>
                  <div style={styles.cardName}>{item.name}</div>
                  <div style={styles.cardRow}>
                    <span style={styles.cardPrice}>{item.price} JOD</span>
                    <span style={styles.cardBids}>{item.bids} bids</span>
                  </div>
                  <button onClick={() => onBidClick && onBidClick(item.id)} style={styles.bidNowBtn}>
                    Bid now
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 9. BOTTOM NAVIGATION BAR */}
      <div style={styles.bottomNavBar}>
        <button style={styles.navItemActive}>
          <Home size={18} style={{ color: '#FF6B00' }} />
          <span style={styles.navLabelActive}>Home</span>
        </button>
        
        <button style={styles.navItemInactive}>
          <Search size={18} style={{ color: '#888888' }} />
          <span style={styles.navLabelInactive}>Explore</span>
        </button>
        
        <button onClick={onSellClick} style={{ ...styles.navCenterBtn, boxShadow: isDark ? '0 0 0 4px #111111' : '0 0 0 4px #FFFFFF' }}>
          <Plus size={20} color="#FFFFFF" />
        </button>
        
        <button style={styles.navItemInactive}>
          <Gavel size={18} style={{ color: '#888888' }} />
          <span style={styles.navLabelInactive}>My Bids</span>
        </button>
        
        <button style={styles.navItemInactive}>
          <User size={18} style={{ color: '#888888' }} />
          <span style={styles.navLabelInactive}>Profile</span>
        </button>
      </div>

    </div>
  );
};

export default HomeView;

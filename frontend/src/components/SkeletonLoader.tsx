import styles from './SkeletonLoader.module.css';

export function SubscriptionsSkeleton() {
  return (
    <div className={styles.container}>
      <div className={`${styles.skeleton} ${styles.headerSkeleton}`} />
      <div className={styles.grid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`${styles.skeleton} ${styles.subCardSkeleton}`} />
        ))}
      </div>
    </div>
  );
}

export function WatchlistSkeleton() {
  return (
    <div className={styles.container}>
      <div className={`${styles.skeleton} ${styles.headerSkeleton}`} />
      <div className={styles.posterGrid}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className={`${styles.skeleton} ${styles.posterCardSkeleton}`} />
        ))}
      </div>
    </div>
  );
}

export function RecommendationsSkeleton() {
  return (
    <div className={styles.container}>
      <div className={`${styles.skeleton} ${styles.heroSkeleton}`} />
      <div className={`${styles.skeleton} ${styles.headerSkeleton}`} style={{ width: '180px' }} />
      <div className={styles.posterGrid}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`${styles.skeleton} ${styles.posterCardSkeleton}`} />
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '1rem' }}>
        <div className={`${styles.skeleton} ${styles.headerSkeleton}`} style={{ width: '260px' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <div className={styles.skeleton} style={{ width: '140px', height: '36px', borderRadius: '12px' }} />
          <div className={styles.skeleton} style={{ width: '90px', height: '36px', borderRadius: '12px' }} />
        </div>
      </div>
      <div className={styles.skeleton} style={{ width: '100%', height: '54px', borderRadius: '14px' }} />
      <div className={styles.calendarGridSkeleton}>
        {Array.from({ length: 28 }).map((_, i) => (
          <div key={i} className={`${styles.skeleton} ${styles.calendarCellSkeleton}`} />
        ))}
      </div>
    </div>
  );
}

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

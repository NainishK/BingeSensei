'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from '../login.module.css';

export default function AuthCallbackPage() {
    const router = useRouter();
    const [status, setStatus] = useState('Connecting to BingeSensei...');

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const error = params.get('error');

        if (token) {
            localStorage.setItem('token', token);
            const isNewUser = params.get('new_user') === 'true';
            // Immediate seamless redirect without artificial lag
            window.location.replace(isNewUser ? '/welcome' : '/dashboard');
        } else if (error) {
            setStatus('Authentication failed. Redirecting to login...');
            setTimeout(() => router.replace('/login'), 1500);
        } else {
            setStatus('Invalid request. Redirecting...');
            setTimeout(() => router.replace('/login'), 1500);
        }
    }, [router]);

    return (
        <div className={styles.container}>
            <div className={styles.callbackWrapper}>
                <div className={styles.callbackPulseGlow}>
                    <Image
                        src="/logo-icon-final-v3.png"
                        alt="BingeSensei Logo Icon"
                        width={56}
                        height={56}
                        style={{ objectFit: 'contain' }}
                        priority
                    />
                </div>
                <p className={styles.callbackStatusText}>{status}</p>
            </div>
        </div>
    );
}

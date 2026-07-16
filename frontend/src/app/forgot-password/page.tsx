'use client';

import { useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import styles from './forgot-password.module.css';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [showLongWait, setShowLongWait] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        setShowLongWait(false);

        // Show "Waking up server" message if it takes longer than 2s (Cold Start detection)
        const waitTimer = setTimeout(() => setShowLongWait(true), 2000);

        try {
            const response = await api.post('/auth/forgot-password', { email });
            setSuccess('Reset link sent! Please check your email inbox (and spam folder).');
        } catch (err: any) {
            console.error('Forgot password error:', err);
            setError(err.response?.data?.detail || 'Failed to request password reset. Server might be sleeping.');
        } finally {
            clearTimeout(waitTimer);
            setLoading(false);
            setShowLongWait(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.glassCard}>
                <div className={styles.brandHeader}>
                    <div className={styles.logoImageContainer}>
                        <Image
                            src="/logo-icon-final-v3.png"
                            alt="BingeSensei Logo Icon"
                            width={56}
                            height={56}
                            style={{ objectFit: 'contain' }}
                            priority
                        />
                    </div>
                    <h1 className={styles.title}>Reset Password</h1>
                    <p className={styles.subtitle}>Enter your email to receive a recovery link</p>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    {success && (
                        <div className={styles.successMessage} style={{
                            color: '#10b981',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            padding: '12px',
                            borderRadius: '10px',
                            marginBottom: '0.5rem',
                            textAlign: 'center',
                            fontSize: '0.9rem',
                            fontWeight: 500
                        }}>
                            {success}
                        </div>
                    )}
                    {error && <div className={styles.error}>{error}</div>}

                    {!success && (
                        <div className={styles.inputGroup}>
                            <input
                                type="email"
                                placeholder="Email Address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className={styles.input}
                            />
                        </div>
                    )}

                    {showLongWait && loading && (
                        <div style={{
                            marginBottom: '0.5rem',
                            padding: '0.75rem',
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '8px',
                            color: '#93c5fd',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <Loader2 className="animate-spin" size={16} />
                            <span>Waking up server... (First request can take ~50s)</span>
                        </div>
                    )}

                    {!success && (
                        <button type="submit" className={styles.button} disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} style={{ marginRight: 8, display: 'inline' }} />
                                    Sending Link...
                                </>
                            ) : 'Send Reset Link'}
                        </button>
                    )}

                    <div className={styles.registerLink}>
                        Remember your password?
                        <Link href="/login">Sign in</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}

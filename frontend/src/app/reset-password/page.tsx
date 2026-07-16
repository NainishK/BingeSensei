'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import styles from './reset-password.module.css';

export default function ResetPasswordPage() {
    const [token, setToken] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [showLongWait, setShowLongWait] = useState(false);
    const router = useRouter();

    // Safely extract token on mount (client-side only, avoids Next.js static build issues)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const tok = params.get('token');
            setToken(tok);
            if (!tok) {
                setError('Invalid or missing password reset token. Please request a new link.');
            }
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!token) {
            setError('Missing password reset token.');
            return;
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        setShowLongWait(false);

        // Server cold start timer
        const waitTimer = setTimeout(() => setShowLongWait(true), 2000);

        try {
            await api.post('/auth/reset-password', {
                token: token,
                new_password: newPassword
            });
            setSuccess('Password updated successfully! Redirecting to login...');
            
            // Redirect to login after 3 seconds
            setTimeout(() => {
                router.push('/login');
            }, 3000);
        } catch (err: any) {
            console.error('Reset password error:', err);
            setError(err.response?.data?.detail || 'Failed to reset password. The link may have expired.');
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
                    <h1 className={styles.title}>New Password</h1>
                    <p className={styles.subtitle}>Enter your secure new password</p>
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

                    {!success && token && (
                        <>
                            <div className={styles.inputGroup}>
                                <input
                                    type="password"
                                    placeholder="New Password (min 6 chars)"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <input
                                    type="password"
                                    placeholder="Confirm New Password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className={styles.input}
                                />
                            </div>
                        </>
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
                            <span>Saving new password... (First request can take ~50s)</span>
                        </div>
                    )}

                    {!success && token && (
                        <button type="submit" className={styles.button} disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} style={{ marginRight: 8, display: 'inline' }} />
                                    Updating...
                                </>
                            ) : 'Update Password'}
                        </button>
                    )}

                    <div className={styles.registerLink}>
                        Back to
                        <Link href="/login">Sign in</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}

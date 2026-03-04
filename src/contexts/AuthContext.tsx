import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import { getDatabase } from '../database/db';
import {
    GoogleSignin,
    statusCodes,
} from '@react-native-google-signin/google-signin';

interface User {
    id: string;
    email: string;
    name?: string;
    photo?: string;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    accessToken: string | null;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (Platform.OS === 'web') {
            // Load Google Identity Services script
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                setLoading(false);
            };
            document.head.appendChild(script);
        } else {
            // Configure Google Sign-In for native (Android / iOS)
            // webClientId は必須。AndroidはSHA-1フィンガープリントでGCPと紐付け済みなので自動認識される。
            GoogleSignin.configure({
                webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
                scopes: ['https://www.googleapis.com/auth/drive.appdata'],
                offlineAccess: false,
            });

            // Try to sign in silently on launch
            const trySilentSignIn = async () => {
                try {
                    const isSignedIn = await GoogleSignin.isSignedIn();
                    if (isSignedIn) {
                        const userInfo = await GoogleSignin.signInSilently();
                        const tokens = await GoogleSignin.getTokens();
                        setAccessToken(tokens.accessToken);
                        setUser({
                            id: userInfo.data?.user.id ?? '',
                            email: userInfo.data?.user.email ?? '',
                            name: userInfo.data?.user.name ?? undefined,
                            photo: userInfo.data?.user.photo ?? undefined,
                        });
                    }
                } catch (error) {
                    console.log('Silent sign-in failed:', error);
                } finally {
                    setLoading(false);
                }
            };
            trySilentSignIn();
        }
    }, []);

    const signIn = async () => {
        if (Platform.OS === 'web') {
            const client = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/drive.appdata email profile',
                prompt: 'consent',
                callback: (response: any) => {
                    if (response.error) {
                        console.error('Google Auth Error:', response.error);
                        return;
                    }

                    if (response.access_token) {
                        const grantedScopes = response.scope || '';
                        if (!grantedScopes.includes('https://www.googleapis.com/auth/drive.appdata')) {
                            alert('Google Driveへのアクセス権限が許可されませんでした。アプリを同期するには、ログイン時に「Google Driveのアプリデータ表示」のチェックを入れてください。');
                            return;
                        }

                        setAccessToken(response.access_token);

                        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: `Bearer ${response.access_token}` }
                        })
                            .then(res => res.json())
                            .then(data => {
                                setUser({
                                    id: data.sub,
                                    email: data.email,
                                    name: data.name,
                                    photo: data.picture,
                                });
                            })
                            .catch(err => console.error('Failed to fetch user info:', err));
                    }
                },
            });
            client.requestAccessToken();
        } else {
            // Native (Android / iOS) Google Sign-In
            try {
                await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
                const userInfo = await GoogleSignin.signIn();
                const tokens = await GoogleSignin.getTokens();

                setAccessToken(tokens.accessToken);
                setUser({
                    id: userInfo.data?.user.id ?? '',
                    email: userInfo.data?.user.email ?? '',
                    name: userInfo.data?.user.name ?? undefined,
                    photo: userInfo.data?.user.photo ?? undefined,
                });
            } catch (error: any) {
                if (error.code === statusCodes.SIGN_IN_CANCELLED) {
                    console.log('サインインがキャンセルされました');
                } else if (error.code === statusCodes.IN_PROGRESS) {
                    console.log('サインイン処理中です');
                } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                    console.error('Google Play Servicesが利用できません');
                } else {
                    console.error('Google Sign-In エラー:', error);
                }
            }
        }
    };

    const signOut = async () => {
        const db = await getDatabase();
        await db.clearDatabase();

        if (Platform.OS === 'web') {
            if (accessToken) {
                try {
                    (window as any).google.accounts.oauth2.revoke(accessToken, () => {
                        setUser(null);
                        setAccessToken(null);
                    });
                } catch (e) {
                    console.error('Error revoking token:', e);
                    setUser(null);
                    setAccessToken(null);
                }
            } else {
                setUser(null);
                setAccessToken(null);
            }
        } else {
            try {
                await GoogleSignin.revokeAccess();
                await GoogleSignin.signOut();
            } catch (e) {
                console.error('Sign out error:', e);
            } finally {
                setUser(null);
                setAccessToken(null);
            }
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, accessToken, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

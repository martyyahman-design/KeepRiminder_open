import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Platform } from 'react-native';
import { getDatabase } from '../database/db';
import {
    GoogleSignin,
    statusCodes,
} from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    getFreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const HAS_LOGGED_IN_KEY = '@KeepReminder:has_logged_in';
const USER_KEY = '@KeepReminder:user';
const ACCESS_TOKEN_KEY = '@KeepReminder:access_token';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const restoreWebSession = useCallback(async () => {
        if (Platform.OS !== 'web') return;
        try {
            const storedUser = localStorage.getItem(USER_KEY);
            const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
            if (storedUser && storedToken) {
                setUser(JSON.parse(storedUser));
                setAccessToken(storedToken);
                console.log('AuthContext: Web session restored');
            }
        } catch (e) {
            console.error('AuthContext: Failed to restore Web session', e);
        }
    }, []);

    useEffect(() => {
        const initializeAuth = async () => {
            if (Platform.OS === 'web') {
                const scriptPromise = new Promise<void>((resolve) => {
                    const script = document.createElement('script');
                    script.src = 'https://accounts.google.com/gsi/client';
                    script.async = true;
                    script.defer = true;
                    script.onload = () => resolve();
                    document.head.appendChild(script);
                });

                await Promise.all([scriptPromise, restoreWebSession()]);
                setLoading(false);
            } else {
                GoogleSignin.configure({
                    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
                    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
                    offlineAccess: true,
                });

                try {
                    const hasLoggedIn = await AsyncStorage.getItem(HAS_LOGGED_IN_KEY);
                    if (hasLoggedIn === 'true' || await GoogleSignin.hasPreviousSignIn()) {
                        const userInfo = await GoogleSignin.signInSilently();
                        const tokens = await GoogleSignin.getTokens();
                        setAccessToken(tokens.accessToken);
                        setUser({
                            id: userInfo.data?.user.id ?? '',
                            email: userInfo.data?.user.email ?? '',
                            name: userInfo.data?.user.name ?? undefined,
                            photo: userInfo.data?.user.photo ?? undefined,
                        });
                        await AsyncStorage.setItem(HAS_LOGGED_IN_KEY, 'true');
                    }
                } catch (error) {
                    console.log('AuthContext: Silent sign-in failed:', error);
                } finally {
                    setLoading(false);
                }
            }
        };

        initializeAuth();
    }, [restoreWebSession]);

    // Function to get a fresh token (Native only)
    const getFreshToken = useCallback(async () => {
        if (Platform.OS === 'web') return accessToken;
        try {
            const tokens = await GoogleSignin.getTokens();
            setAccessToken(tokens.accessToken);
            return tokens.accessToken;
        } catch (e) {
            console.error('AuthContext: Failed to refresh native token', e);
            return accessToken;
        }
    }, [accessToken]);

    const signIn = async () => {
        if (Platform.OS === 'web') {
            const client = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/drive.appdata email profile',
                prompt: 'consent',
                callback: async (response: any) => {
                    if (response.error) return;

                    if (response.access_token) {
                        const grantedScopes = response.scope || '';
                        if (!grantedScopes.includes('https://www.googleapis.com/auth/drive.appdata')) {
                            alert('Google Driveへのアクセス権限が許可されませんでした。アプリを同期するには、ログイン時に「Google Driveのアプリデータ表示」のチェックを入れてください。');
                            return;
                        }

                        setAccessToken(response.access_token);
                        localStorage.setItem(ACCESS_TOKEN_KEY, response.access_token);

                        try {
                            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                headers: { Authorization: `Bearer ${response.access_token}` }
                            });
                            const data = await res.json();
                            const userData = {
                                id: data.sub,
                                email: data.email,
                                name: data.name,
                                photo: data.picture,
                            };
                            setUser(userData);
                            localStorage.setItem(USER_KEY, JSON.stringify(userData));
                            await AsyncStorage.setItem(HAS_LOGGED_IN_KEY, 'true');
                        } catch (err) {
                            console.error('AuthContext: UserInfo fetch failed', err);
                        }
                    }
                },
            });
            client.requestAccessToken();
        } else {
            try {
                await GoogleSignin.hasPlayServices();
                const userInfo = await GoogleSignin.signIn();
                const tokens = await GoogleSignin.getTokens();
                setAccessToken(tokens.accessToken);
                setUser({
                    id: userInfo.data?.user.id ?? '',
                    email: userInfo.data?.user.email ?? '',
                    name: userInfo.data?.user.name ?? undefined,
                    photo: userInfo.data?.user.photo ?? undefined,
                });
                await AsyncStorage.setItem(HAS_LOGGED_IN_KEY, 'true');
            } catch (error) {
                console.error('AuthContext: Native Sign-In Error', error);
            }
        }
    };

    const signOut = async () => {
        const db = await getDatabase();
        await db.clearDatabase();
        await AsyncStorage.removeItem(HAS_LOGGED_IN_KEY);

        if (Platform.OS === 'web') {
            localStorage.removeItem(USER_KEY);
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            if (accessToken) {
                try {
                    (window as any).google.accounts.oauth2.revoke(accessToken, () => {
                        setUser(null);
                        setAccessToken(null);
                    });
                } catch (e) {
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
                console.error('AuthContext: Native Sign-Out Error', e);
            } finally {
                setUser(null);
                setAccessToken(null);
            }
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, accessToken, signIn, signOut, getFreshToken }}>
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

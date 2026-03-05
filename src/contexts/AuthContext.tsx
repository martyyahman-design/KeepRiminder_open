import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const HAS_LOGGED_IN_KEY = '@KeepReminder:has_logged_in';
const USER_KEY = '@KeepReminder:user';
const ACCESS_TOKEN_KEY = '@KeepReminder:access_token';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initializeAuth = async () => {
            if (Platform.OS === 'web') {
                // Load Google Identity Services script
                const scriptPromise = new Promise<void>((resolve) => {
                    const script = document.createElement('script');
                    script.src = 'https://accounts.google.com/gsi/client';
                    script.async = true;
                    script.defer = true;
                    script.onload = () => resolve();
                    document.head.appendChild(script);
                });

                // Restore session from AsyncStorage
                const restoreSession = async () => {
                    try {
                        const storedUser = await AsyncStorage.getItem(USER_KEY);
                        const storedToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
                        if (storedUser && storedToken) {
                            setUser(JSON.parse(storedUser));
                            setAccessToken(storedToken);
                            console.log('Web Auth session restored');
                        }
                    } catch (e) {
                        console.error('Failed to restore Web auth session', e);
                    }
                };

                await Promise.all([scriptPromise, restoreSession()]);
                setLoading(false);
            } else {
                // Configure Google Sign-In for native (Android / iOS)
                GoogleSignin.configure({
                    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
                    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
                    offlineAccess: true,
                });

                try {
                    const hasLoggedIn = await AsyncStorage.getItem(HAS_LOGGED_IN_KEY);
                    const hasPrevious = await GoogleSignin.hasPreviousSignIn();

                    if (hasLoggedIn === 'true' || hasPrevious) {
                        console.log('Detected previous sign-in. Attempting silent sign-in...');
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
                    console.log('Silent sign-in failed or no session:', error);
                } finally {
                    setLoading(false);
                }
            }
        };

        initializeAuth();
    }, []);

    const signIn = async () => {
        if (Platform.OS === 'web') {
            const client = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/drive.appdata email profile',
                prompt: 'consent',
                callback: async (response: any) => {
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
                        await AsyncStorage.setItem(ACCESS_TOKEN_KEY, response.access_token);

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
                            await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
                            await AsyncStorage.setItem(HAS_LOGGED_IN_KEY, 'true');
                        } catch (err) {
                            console.error('Failed to fetch user info:', err);
                        }
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
                const userData = {
                    id: userInfo.data?.user.id ?? '',
                    email: userInfo.data?.user.email ?? '',
                    name: userInfo.data?.user.name ?? undefined,
                    photo: userInfo.data?.user.photo ?? undefined,
                };
                setUser(userData);
                await AsyncStorage.setItem(HAS_LOGGED_IN_KEY, 'true');
            } catch (error: any) {
                // handle errors...
            }
        }
    };

    const signOut = async () => {
        const db = await getDatabase();
        await db.clearDatabase();
        await AsyncStorage.removeItem(HAS_LOGGED_IN_KEY);
        await AsyncStorage.removeItem(USER_KEY);
        await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);

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

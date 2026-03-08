import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

interface NetworkContextType {
    isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextType>({ isOnline: true });

export function useNetwork() {
    return useContext(NetworkContext);
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        if (Platform.OS === 'web') {
            const handleOnline = () => setIsOnline(true);
            const handleOffline = () => setIsOnline(false);

            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);

            // Initial state
            setIsOnline(navigator.onLine);

            return () => {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            };
        } else {
            // No native reliable module available in simple Expo Go without build,
            // fallback to pure JS periodic ping.
            let isMounted = true;

            const checkNetwork = async () => {
                try {
                    // Ping google generating a 204 or just something lightweight
                    const response = await fetch('https://clients3.google.com/generate_204', {
                        method: 'HEAD',
                        cache: 'no-cache',
                    });
                    if (isMounted) {
                        setIsOnline(response.ok || response.status === 204);
                    }
                } catch (e) {
                    if (isMounted) setIsOnline(false);
                }
            };

            checkNetwork(); // Initial check
            const interval = setInterval(checkNetwork, 5000); // Check every 5 seconds

            return () => {
                isMounted = false;
                clearInterval(interval);
            };
        }
    }, []);

    return (
        <NetworkContext.Provider value={{ isOnline }}>
            {children}
        </NetworkContext.Provider>
    );
}

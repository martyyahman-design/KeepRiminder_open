import { Platform } from 'react-native';
import { Trigger } from '../types/models';

export async function requestLocationPermissions(): Promise<boolean> {
    return false;
}

export async function registerGeofence(trigger: Trigger): Promise<void> {
    // No-op on web
}

export async function unregisterGeofence(triggerId: string): Promise<void> {
    // No-op on web
}

export async function syncGeofences(): Promise<void> {
    // No-op on web
}

export async function getCurrentLocation(): Promise<any | null> {
    if (Platform.OS === 'web') {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        coords: {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                        },
                    });
                },
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }
    return null;
}

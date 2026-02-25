import { Platform } from 'react-native';
import { Trigger } from '../types/models';
import { getMemo } from '../database/repositories/memoRepository';
import { sendNotification } from './notificationService';
import { startAlarm } from './alarmService';

const GEOFENCING_TASK = 'keepreminder-geofencing';

// Conditionally set up geofencing on native platforms
if (Platform.OS !== 'web') {
    try {
        const TaskManager = require('expo-task-manager');
        const Location = require('expo-location');

        TaskManager.defineTask(GEOFENCING_TASK, async ({ data, error }: any) => {
            if (error) {
                console.error('Geofencing task error:', error);
                return;
            }

            if (data) {
                const { eventType, region } = data;
                await handleGeofenceEvent(eventType, region);
            }
        });
    } catch (err) {
        console.warn('Failed to set up geofencing task:', err);
    }
}

async function handleGeofenceEvent(eventType: number, region: any): Promise<void> {
    try {
        const Location = require('expo-location');
        const triggerId = region.identifier;
        if (!triggerId) return;

        const { getTrigger } = await import('../database/repositories/triggerRepository');
        const trigger = await getTrigger(triggerId);
        if (!trigger || !trigger.isActive) return;

        const isEnter = eventType === Location.GeofencingEventType.Enter;
        const isExit = eventType === Location.GeofencingEventType.Exit;

        if (
            (trigger.type === 'location_enter' && !isEnter) ||
            (trigger.type === 'location_exit' && !isExit)
        ) {
            return;
        }

        const memo = await getMemo(trigger.memoId);
        if (!memo) return;

        if (trigger.actionType === 'alarm') {
            await startAlarm(memo, trigger);
        } else {
            await sendNotification(memo, trigger);
        }
    } catch (err) {
        console.error('Error handling geofence event:', err);
    }
}

export async function requestLocationPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;

    try {
        const Location = require('expo-location');
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') return false;

        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
            console.warn('Background location permission not granted.');
        }

        return true;
    } catch (err) {
        console.warn('Error requesting location permissions:', err);
        return false;
    }
}

export async function registerGeofence(trigger: Trigger): Promise<void> {
    if (Platform.OS === 'web') return;

    if (
        trigger.latitude === undefined ||
        trigger.longitude === undefined ||
        trigger.radius === undefined
    ) {
        throw new Error('Location trigger must have latitude, longitude, and radius');
    }

    const Location = require('expo-location');
    const TaskManager = require('expo-task-manager');

    const region = {
        identifier: trigger.id,
        latitude: trigger.latitude,
        longitude: trigger.longitude,
        radius: trigger.radius,
        notifyOnEnter: trigger.type === 'location_enter',
        notifyOnExit: trigger.type === 'location_exit',
    };

    const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK);

    if (isRegistered) {
        const existingRegions = await getRegisteredGeofences();
        const updatedRegions = existingRegions.filter((r: any) => r.identifier !== trigger.id);
        updatedRegions.push(region);
        await Location.startGeofencingAsync(GEOFENCING_TASK, updatedRegions);
    } else {
        await Location.startGeofencingAsync(GEOFENCING_TASK, [region]);
    }
}

export async function unregisterGeofence(triggerId: string): Promise<void> {
    if (Platform.OS === 'web') return;

    const Location = require('expo-location');
    const TaskManager = require('expo-task-manager');

    const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK);
    if (!isRegistered) return;

    const existingRegions = await getRegisteredGeofences();
    const updatedRegions = existingRegions.filter((r: any) => r.identifier !== triggerId);

    if (updatedRegions.length > 0) {
        await Location.startGeofencingAsync(GEOFENCING_TASK, updatedRegions);
    } else {
        await Location.stopGeofencingAsync(GEOFENCING_TASK);
    }
}

export async function syncGeofences(): Promise<void> {
    if (Platform.OS === 'web') return;

    const Location = require('expo-location');
    const TaskManager = require('expo-task-manager');
    const { getActiveTriggersByType } = await import('../database/repositories/triggerRepository');

    const enterTriggers = await getActiveTriggersByType('location_enter');
    const exitTriggers = await getActiveTriggersByType('location_exit');
    const allLocationTriggers = [...enterTriggers, ...exitTriggers];

    if (allLocationTriggers.length === 0) {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK);
        if (isRegistered) {
            await Location.stopGeofencingAsync(GEOFENCING_TASK);
        }
        return;
    }

    const regions = allLocationTriggers
        .filter(t => t.latitude !== undefined && t.longitude !== undefined && t.radius !== undefined)
        .map(t => ({
            identifier: t.id,
            latitude: t.latitude!,
            longitude: t.longitude!,
            radius: t.radius!,
            notifyOnEnter: t.type === 'location_enter',
            notifyOnExit: t.type === 'location_exit',
        }));

    if (regions.length > 0) {
        await Location.startGeofencingAsync(GEOFENCING_TASK, regions);
    }
}

async function getRegisteredGeofences(): Promise<any[]> {
    try {
        const TaskManager = require('expo-task-manager');
        const taskInfo = await TaskManager.getRegisteredTasksAsync();
        const geofenceTask = taskInfo.find((t: any) => t.taskName === GEOFENCING_TASK);
        if (geofenceTask && geofenceTask.options?.regions) {
            return geofenceTask.options.regions;
        }
    } catch {
        // ignore
    }
    return [];
}

export async function getCurrentLocation(): Promise<any | null> {
    if (Platform.OS === 'web') {
        // Use browser Geolocation API on web
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

    try {
        const Location = require('expo-location');
        const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });
        return location;
    } catch (err) {
        console.error('Error getting current location:', err);
        return null;
    }
}

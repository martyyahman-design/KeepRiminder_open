import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, Spacing, FontSize, BorderRadius } from '../../src/theme';
import { useMemos } from '../../src/contexts/MemoContext';
import MapViewComponent from '../../src/components/MapViewComponent';

export default function MapScreen() {
    const colors = useThemeColors();
    const { memos } = useMemos();
    const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [loading, setLoading] = useState(true);

    // Get all location triggers from memos
    const locationTriggers = memos.flatMap(memo =>
        memo.triggers
            .filter(t =>
                (t.type === 'location_enter' || t.type === 'location_exit') &&
                t.latitude !== undefined &&
                t.longitude !== undefined
            )
            .map(t => ({ ...t, memoTitle: memo.title, memoId: memo.id }))
    );

    useEffect(() => {
        if (Platform.OS !== 'web') {
            loadLocation();
        } else {
            setLoading(false);
        }
    }, []);

    async function loadLocation() {
        try {
            const Location = require('expo-location');
            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            if (loc) {
                setLocation({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                });
            }
        } catch (err) {
            console.error('Error getting location:', err);
        } finally {
            setLoading(false);
        }
    }

    const renderTriggerList = () => (
        <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
            <Ionicons name="map-outline" size={64} color={colors.textTertiary} />
            <Text style={[styles.webNotice, { color: colors.textSecondary }]}>
                マップはモバイルアプリでご利用いただけます
            </Text>
            {locationTriggers.length > 0 && (
                <View style={styles.triggerList}>
                    <Text style={[styles.triggerListTitle, { color: colors.text }]}>
                        場所トリガー ({locationTriggers.length})
                    </Text>
                    {locationTriggers.map(t => (
                        <TouchableOpacity
                            key={t.id}
                            style={[styles.triggerItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => router.push(`/memo/${t.memoId}`)}
                        >
                            <Ionicons
                                name={t.type === 'location_enter' ? 'enter' : 'exit'}
                                size={18}
                                color={colors.primary}
                            />
                            <View style={styles.triggerItemInfo}>
                                <Text style={[styles.triggerItemTitle, { color: colors.text }]}>
                                    {t.locationName || '場所'}
                                </Text>
                                <Text style={[styles.triggerItemSubtitle, { color: colors.textSecondary }]}>
                                    {t.memoTitle || '無題'} · {t.type === 'location_enter' ? '入場時' : '退場時'}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );

    if (loading) {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {Platform.OS === 'web' ? (
                renderTriggerList()
            ) : (
                <MapViewComponent
                    location={location}
                    locationTriggers={locationTriggers}
                    onMarkerCalloutPress={(memoId) => router.push(`/memo/${memoId}`)}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    webNotice: {
        fontSize: FontSize.lg,
        marginTop: Spacing.lg,
        textAlign: 'center',
    },
    triggerList: {
        width: '100%',
        marginTop: Spacing.xxl,
    },
    triggerListTitle: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        marginBottom: Spacing.md,
    },
    triggerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.lg,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        marginBottom: Spacing.sm,
        gap: Spacing.md,
    },
    triggerItemInfo: {
        flex: 1,
    },
    triggerItemTitle: {
        fontSize: FontSize.md,
        fontWeight: '600',
    },
    triggerItemSubtitle: {
        fontSize: FontSize.sm,
        marginTop: 2,
    },
});

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Pressable,
    Dimensions,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, Spacing, FontSize, BorderRadius, getCardShadow } from '../theme';
import { getCurrentLocation } from '../services/geofencingService';

// Standard Slider is deprecated in core, but for simplicity we'll check if available
import Slider from '@react-native-community/slider';

const SliderComponent = Platform.OS === 'web' ? View : Slider;

interface MapPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { latitude: number; longitude: number; radius: number }) => void;
    initialLocation?: { latitude: number; longitude: number; radius: number };
}

let MapView: any;
let Marker: any;
let Circle: any;
let PROVIDER_GOOGLE: any;

if (Platform.OS !== 'web') {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
    Circle = Maps.Circle;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

export const MapPicker: React.FC<MapPickerProps> = ({
    visible,
    onClose,
    onSelect,
    initialLocation,
}) => {
    const colors = useThemeColors();
    const [region, setRegion] = useState({
        latitude: initialLocation?.latitude || 35.6812,
        longitude: initialLocation?.longitude || 139.7671,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    });
    const [radius, setRadius] = useState(initialLocation?.radius || 200);

    useEffect(() => {
        if (visible && initialLocation) {
            setRegion({
                ...region,
                latitude: initialLocation.latitude,
                longitude: initialLocation.longitude,
            });
            setRadius(initialLocation.radius);
        }
    }, [visible]);

    const handleConfirm = () => {
        onSelect({
            latitude: region.latitude,
            longitude: region.longitude,
            radius,
        });
        onClose();
    };

    const handleUseCurrentLocation = async () => {
        const loc = await getCurrentLocation();
        if (loc) {
            setRegion({
                ...region,
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
            });
        }
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
            <View style={styles.modalOverlay}>
                <View style={[styles.container, { backgroundColor: colors.surface }]}>
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>エリアを指定</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.mapWrapper}>
                        <MapView
                            style={styles.map}
                            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                            region={region}
                            onRegionChangeComplete={setRegion}
                            onLongPress={(e: any) => {
                                setRegion({
                                    ...region,
                                    latitude: e.nativeEvent.coordinate.latitude,
                                    longitude: e.nativeEvent.coordinate.longitude,
                                });
                            }}
                        >
                            <Marker
                                coordinate={{ latitude: region.latitude, longitude: region.longitude }}
                                draggable
                                onDragEnd={(e: any) => {
                                    setRegion({
                                        ...region,
                                        latitude: e.nativeEvent.coordinate.latitude,
                                        longitude: e.nativeEvent.coordinate.longitude,
                                    });
                                }}
                            />
                            <Circle
                                center={{ latitude: region.latitude, longitude: region.longitude }}
                                radius={radius}
                                strokeColor={colors.primary}
                                fillColor={`${colors.primary}33`}
                            />
                        </MapView>

                        <TouchableOpacity
                            style={[styles.currentLocBtn, { backgroundColor: colors.surfaceElevated, ...getCardShadow(colors) }]}
                            onPress={handleUseCurrentLocation}
                        >
                            <Ionicons name="locate" size={24} color={colors.primary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.controls}>
                        <View style={styles.radiusRow}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>半径: {radius}m</Text>
                        </View>
                        <SliderComponent
                            style={styles.slider}
                            minimumValue={100}
                            maximumValue={2000}
                            step={50}
                            value={radius}
                            onValueChange={setRadius}
                            minimumTrackTintColor={colors.primary}
                            maximumTrackTintColor={colors.border}
                        />

                        <TouchableOpacity
                            style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                            onPress={handleConfirm}
                        >
                            <Text style={styles.confirmBtnText}>このエリアに決定</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        height: Dimensions.get('window').height * 0.85,
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
    },
    title: {
        fontSize: FontSize.lg,
        fontWeight: '700',
    },
    mapWrapper: {
        flex: 1,
        position: 'relative',
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    currentLocBtn: {
        position: 'absolute',
        bottom: Spacing.md,
        right: Spacing.md,
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    controls: {
        padding: Spacing.xl,
        paddingBottom: Spacing.xxl,
    },
    radiusRow: {
        marginBottom: Spacing.sm,
    },
    label: {
        fontSize: FontSize.md,
        fontWeight: '600',
    },
    slider: {
        width: '100%',
        height: 40,
        marginBottom: Spacing.xl,
    },
    confirmBtn: {
        height: 50,
        borderRadius: BorderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmBtnText: {
        color: '#fff',
        fontSize: FontSize.md,
        fontWeight: '700',
    },
    webContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    closeBtn: {
        marginTop: Spacing.xl,
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xl,
        borderRadius: BorderRadius.md,
    },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';

interface MapViewComponentProps {
    location: { latitude: number; longitude: number } | null;
    locationTriggers: any[];
    onMarkerCalloutPress: (memoId: string) => void;
}

export default function MapViewComponent({
    location,
    locationTriggers,
    onMarkerCalloutPress,
}: MapViewComponentProps) {
    const initialRegion = location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
        }
        : locationTriggers.length > 0
            ? {
                latitude: locationTriggers[0].latitude,
                longitude: locationTriggers[0].longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            }
            : {
                latitude: 35.6812,
                longitude: 139.7671,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            };

    return (
        <MapView
            style={styles.map}
            initialRegion={initialRegion}
            showsUserLocation
            showsMyLocationButton
        >
            {locationTriggers.map((trigger) => (
                <React.Fragment key={trigger.id}>
                    <Marker
                        coordinate={{
                            latitude: trigger.latitude!,
                            longitude: trigger.longitude!,
                        }}
                        title={trigger.memoTitle || '無題'}
                        description={`${trigger.locationName || '場所'} · ${trigger.type === 'location_enter' ? '入場時に通知' : '退場時に通知'
                            }`}
                        onCalloutPress={() => onMarkerCalloutPress(trigger.memoId)}
                    />
                    <Circle
                        center={{
                            latitude: trigger.latitude!,
                            longitude: trigger.longitude!,
                        }}
                        radius={trigger.radius || 200}
                        fillColor={
                            trigger.type === 'location_enter'
                                ? 'rgba(108, 92, 231, 0.15)'
                                : 'rgba(255, 107, 107, 0.15)'
                        }
                        strokeColor={
                            trigger.type === 'location_enter'
                                ? 'rgba(108, 92, 231, 0.5)'
                                : 'rgba(255, 107, 107, 0.5)'
                        }
                        strokeWidth={2}
                    />
                </React.Fragment>
            ))}
        </MapView>
    );
}

const styles = StyleSheet.create({
    map: {
        flex: 1,
    },
});

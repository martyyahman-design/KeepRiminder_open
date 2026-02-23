import React from 'react';
import { StyleSheet, View, Text, Ionicons } from 'react-native';
// Note: No react-native-maps import here for web compatibility

interface MapViewComponentProps {
    location: any;
    locationTriggers: any[];
    onMarkerCalloutPress: (memoId: string) => void;
}

export default function MapViewComponent({ }: MapViewComponentProps) {
    // Web fallback: Just showing a notice that maps are not supported on web in this setup
    // In a real scenario, we could use Google Maps JS API or leaflet-react-native-web
    return null;
}

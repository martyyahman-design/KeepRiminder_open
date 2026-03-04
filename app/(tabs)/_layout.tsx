import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../src/theme';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();

    // Bottom navigation bar height computation
    const bottomPadding = Platform.OS === 'web' ? 15 : Math.max(insets.bottom, 12);
    const tabHeight = Platform.OS === 'web' ? 70 : 53 + bottomPadding;

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: colors.tabBarActive,
                tabBarInactiveTintColor: colors.tabBarInactive,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    height: tabHeight,
                    paddingBottom: bottomPadding,
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                },
                headerStyle: {
                    backgroundColor: colors.background,
                },
                headerTintColor: colors.text,
                headerShadowVisible: false,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    headerShown: false,
                    title: 'メモ',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="documents" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="calendar"
                options={{
                    title: 'カレンダー',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="calendar" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="map"
                options={{
                    href: null,
                }}
            />
        </Tabs>
    );
}

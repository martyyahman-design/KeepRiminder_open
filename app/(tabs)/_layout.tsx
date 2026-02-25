import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../src/theme';
import { Platform } from 'react-native';

export default function TabLayout() {
    const colors = useThemeColors();

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: colors.tabBarActive,
                tabBarInactiveTintColor: colors.tabBarInactive,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    height: Platform.OS === 'ios' ? 88 : 60,
                    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                },
                headerStyle: {
                    backgroundColor: colors.background,
                    elevation: 0,
                    shadowOpacity: 0,
                },
                headerTintColor: colors.text,
                headerShadowVisible: false,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
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

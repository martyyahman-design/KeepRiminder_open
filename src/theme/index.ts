import { useColorScheme } from 'react-native';

export const Colors = {
    light: {
        primary: '#6C5CE7',
        primaryLight: '#A29BFE',
        primaryDark: '#5641D4',
        secondary: '#00CEC9',
        accent: '#FF6B6B',
        background: '#F5F5F7',
        surface: '#FFFFFF',
        surfaceElevated: '#FFFFFF',
        text: '#1A1A2E',
        textSecondary: '#6B7280',
        textTertiary: '#9CA3AF',
        border: '#E5E7EB',
        borderLight: '#F3F4F6',
        success: '#00B894',
        warning: '#FDCB6E',
        error: '#FF6B6B',
        shadow: 'rgba(0, 0, 0, 0.08)',
        overlay: 'rgba(0, 0, 0, 0.5)',
        fab: '#6C5CE7',
        fabText: '#FFFFFF',
        tabBar: '#FFFFFF',
        tabBarBorder: '#E5E7EB',
        tabBarActive: '#6C5CE7',
        tabBarInactive: '#9CA3AF',
        statusBar: 'dark' as const,
        cardShadow: 'rgba(108, 92, 231, 0.1)',
    },
    dark: {
        primary: '#A29BFE',
        primaryLight: '#6C5CE7',
        primaryDark: '#C4B5FD',
        secondary: '#00CEC9',
        accent: '#FF6B6B',
        background: '#0F0F1A',
        surface: '#1A1A2E',
        surfaceElevated: '#232342',
        text: '#F5F5F7',
        textSecondary: '#9CA3AF',
        textTertiary: '#6B7280',
        border: '#2D2D4A',
        borderLight: '#1F1F3A',
        success: '#00B894',
        warning: '#FDCB6E',
        error: '#FF6B6B',
        shadow: 'rgba(0, 0, 0, 0.3)',
        overlay: 'rgba(0, 0, 0, 0.7)',
        fab: '#A29BFE',
        fabText: '#0F0F1A',
        tabBar: '#1A1A2E',
        tabBarBorder: '#2D2D4A',
        tabBarActive: '#A29BFE',
        tabBarInactive: '#6B7280',
        statusBar: 'light' as const,
        cardShadow: 'rgba(162, 155, 254, 0.15)',
    },
};

export type ThemeColors = typeof Colors.light;

export function useThemeColors(): ThemeColors {
    const scheme = useColorScheme();
    return scheme === 'dark' ? Colors.dark : Colors.light;
}

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

export const FontSize = {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    title: 28,
};

export const BorderRadius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 999,
};

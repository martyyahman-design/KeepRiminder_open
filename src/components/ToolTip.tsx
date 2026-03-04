import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColors, FontSize, BorderRadius } from '../theme';

interface ToolTipProps {
    visible: boolean;
    message: string;
    style?: ViewStyle;
    duration?: number;
}

export default function ToolTip({ visible, message, style, duration = 3000 }: ToolTipProps) {
    const opacity = useRef(new Animated.Value(0)).current;
    const colors = useThemeColors();

    useEffect(() => {
        if (visible) {
            // Fade in
            Animated.timing(opacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();
        } else {
            // Fade out
            Animated.timing(opacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [visible]);

    // Don't render anything if it's completely invisible and not supposed to be visible
    // @ts-ignore: _value is internal but safe to read for this simple case
    if (!visible && opacity._value === 0) {
        return null;
    }

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    backgroundColor: colors.text,
                    opacity,
                },
                style,
            ]}
            pointerEvents="none" // Prevent tooltip from intercepting touches
        >
            <Text style={[styles.text, { color: colors.background }]}>{message}</Text>
            {/* Simple Triangle (Arrow) pointing up */}
            <Animated.View
                style={[
                    styles.arrow,
                    {
                        borderBottomColor: colors.text,
                        opacity,
                    }
                ]}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: '100%',     // Position right below the parent container
        marginTop: 8,    // Small gap
        alignSelf: 'center', // Center under the icon
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: BorderRadius.sm,
        zIndex: 1000,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        alignItems: 'center',

        // Ensure text doesn't wrap awkwardly if it's long, but allow multi-line if needed
        minWidth: 100,
    },
    text: {
        fontSize: FontSize.xs,
        fontWeight: '600',
        textAlign: 'center',
    },
    arrow: {
        position: 'absolute',
        top: -6,
        alignSelf: 'center',
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderBottomWidth: 6,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
    }
});

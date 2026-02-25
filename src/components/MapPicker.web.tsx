import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
} from 'react-native';
import { useThemeColors, Spacing, BorderRadius } from '../theme';

interface MapPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { latitude: number; longitude: number; radius: number }) => void;
    initialLocation?: { latitude: number; longitude: number; radius: number };
}

export const MapPicker: React.FC<MapPickerProps> = ({
    visible,
    onClose,
}) => {
    const colors = useThemeColors();

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={[styles.webContainer, { backgroundColor: colors.background }]}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.text, { color: colors.text }]}>
                        地図表示はモバイルアプリ版でのみ利用可能です。
                    </Text>
                    <TouchableOpacity
                        onPress={onClose}
                        style={[styles.closeBtn, { backgroundColor: colors.primary }]}
                    >
                        <Text style={styles.closeBtnText}>閉じる</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    webContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    card: {
        padding: Spacing.xxl,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        alignItems: 'center',
        maxWidth: 400,
    },
    text: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: Spacing.xl,
        lineHeight: 24,
    },
    closeBtn: {
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xxl,
        borderRadius: BorderRadius.md,
    },
    closeBtnText: {
        color: '#fff',
        fontWeight: '700',
    },
});

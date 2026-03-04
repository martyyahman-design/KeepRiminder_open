import React, { useState, useEffect } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { Trigger } from '../types/models';

interface CountdownTextProps {
    trigger: Trigger;
    style?: StyleProp<TextStyle>;
    hideIcon?: boolean;
}

export const CountdownText: React.FC<CountdownTextProps> = ({ trigger, style, hideIcon }) => {
    const [remaining, setRemaining] = useState<number>(0);

    useEffect(() => {
        if (trigger.type !== 'timer' || !trigger.isActive || !trigger.startedAt) {
            return;
        }

        const calculateRemaining = () => {
            const now = new Date().getTime();
            let rem = 0;

            if (trigger.scheduledAt) {
                // If a snoozed timer relies on scheduledAt, count down to that explicit target
                const target = new Date(trigger.scheduledAt).getTime();
                rem = Math.max(0, Math.floor((target - now) / 1000));
            } else if (trigger.durationSeconds) {
                // Standard un-snoozed timer behavior
                const start = new Date(trigger.startedAt!).getTime();
                const duration = trigger.durationSeconds * 1000;
                rem = Math.max(0, Math.floor((start + duration - now) / 1000));
            }

            setRemaining(rem);
        };

        calculateRemaining();
        const interval = setInterval(calculateRemaining, 1000);

        return () => clearInterval(interval);
    }, [trigger.startedAt, trigger.durationSeconds, trigger.scheduledAt, trigger.isActive]);

    if (!trigger.isActive || remaining <= 0) return null;

    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;

    const parts = [];
    if (h > 0) parts.push(`${h}:`);
    parts.push(`${m.toString().padStart(2, '0')}:`);
    parts.push(s.toString().padStart(2, '0'));

    return (
        <Text style={style}>
            {!hideIcon && '⏱️ '}
            あと {parts.join('')}
        </Text>
    );
};

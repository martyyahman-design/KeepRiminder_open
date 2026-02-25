// Memo & Trigger type definitions
export interface Memo {
    id: string;
    title: string;
    content: string;
    color: MemoColor;
    isPinned: boolean;

    // TODO fields
    todoType: 'none' | 'deadline' | 'daily';
    todoDate: string | null; // YYYY-MM-DD
    isCompleted: boolean;
    completedAt: string | null;

    createdAt: string;
    updatedAt: string;
}

export type MemoColor =
    | 'default'
    | 'coral'
    | 'peach'
    | 'sand'
    | 'mint'
    | 'sage'
    | 'fog'
    | 'storm'
    | 'dusk'
    | 'blossom'
    | 'clay'
    | 'chalk';

export type TriggerType = 'datetime' | 'timer' | 'location_enter' | 'location_exit';
export type ActionType = 'notification' | 'alarm';

export interface Trigger {
    id: string;
    memoId: string;
    type: TriggerType;
    isActive: boolean;

    // datetime trigger
    scheduledAt?: string;

    // timer trigger
    durationSeconds?: number;
    startedAt?: string;

    // location trigger
    latitude?: number;
    longitude?: number;
    radius?: number; // meters
    locationName?: string;

    // action
    actionType: ActionType;

    createdAt: string;
    updatedAt: string;
}

export interface LocationPreset {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    createdAt: string;
    updatedAt: string;
}

export interface MemoWithTriggers extends Memo {
    triggers: Trigger[];
}

// Color mapping for UI
export const MEMO_COLORS: Record<MemoColor, { bg: string; bgDark: string; text: string }> = {
    default: { bg: '#ffffff', bgDark: '#1e1e2e', text: '#212121' },
    coral: { bg: '#faafa8', bgDark: '#77172e', text: '#212121' },
    peach: { bg: '#f39f76', bgDark: '#692b17', text: '#212121' },
    sand: { bg: '#fff8b8', bgDark: '#7c4a03', text: '#212121' },
    mint: { bg: '#e2f6d3', bgDark: '#264d3b', text: '#212121' },
    sage: { bg: '#b4ddd3', bgDark: '#0d625d', text: '#212121' },
    fog: { bg: '#d4e4ed', bgDark: '#256377', text: '#212121' },
    storm: { bg: '#aeccdc', bgDark: '#284255', text: '#212121' },
    dusk: { bg: '#d3bfdb', bgDark: '#472e5b', text: '#212121' },
    blossom: { bg: '#f6e2dd', bgDark: '#6c394f', text: '#212121' },
    clay: { bg: '#e9e3d4', bgDark: '#4b443a', text: '#212121' },
    chalk: { bg: '#efeff1', bgDark: '#232427', text: '#212121' },
};

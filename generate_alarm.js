const fs = require('fs');
const path = require('path');

const sampleRate = 44100;
const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
const duration = 0.15; // seconds per note
const volume = 0.6;

const generateTone = (frequency, durationSecs) => {
    const numSamples = Math.floor(sampleRate * durationSecs);
    const buffer = Buffer.alloc(numSamples * 2);

    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let envelope = 1.0;
        if (t < 0.05) envelope = t / 0.05;
        else if (t > durationSecs - 0.05) envelope = (durationSecs - t) / 0.05;

        let val = Math.sin(2 * Math.PI * frequency * t);
        val += 0.3 * Math.sin(4 * Math.PI * frequency * t);
        val += 0.1 * Math.sin(6 * Math.PI * frequency * t);

        const amplitude = 32767 * volume * envelope;
        let sample = Math.round(amplitude * val);
        sample = Math.max(-32768, Math.min(32767, sample));

        buffer.writeInt16LE(sample, i * 2);
    }
    return buffer;
};

const buffers = [];
for (let loop = 0; loop < 4; loop++) {
    for (const freq of notes) {
        buffers.push(generateTone(freq, duration));
    }
    for (let i = notes.length - 2; i >= 0; i--) {
        buffers.push(generateTone(notes[i], duration));
    }

    // Pause
    const pauseSamples = Math.floor(sampleRate * 0.8);
    buffers.push(Buffer.alloc(pauseSamples * 2));
}

const dataPart = Buffer.concat(buffers);

// Write WAV header
const dataSize = dataPart.length;
const fileSize = 36 + dataSize;
const header = Buffer.alloc(44);

// "RIFF" chunk descriptor
header.write('RIFF', 0);
header.writeUInt32LE(fileSize, 4);
header.write('WAVE', 8);

// "fmt " sub-chunk
header.write('fmt ', 12);
header.writeUInt32LE(16, 16); // Subchunk1Size
header.writeUInt16LE(1, 20); // AudioFormat
header.writeUInt16LE(1, 22); // NumChannels
header.writeUInt32LE(sampleRate, 24); // SampleRate
header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
header.writeUInt16LE(2, 32); // BlockAlign
header.writeUInt16LE(16, 34); // BitsPerSample

// "data" sub-chunk
header.write('data', 36);
header.writeUInt32LE(dataSize, 40);

const fileBuffer = Buffer.concat([header, dataPart]);
const outDir = path.join(__dirname, 'assets', 'sounds');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}
fs.writeFileSync(path.join(outDir, 'melodic_alarm.wav'), fileBuffer);
console.log('WAV file generated successfully.');

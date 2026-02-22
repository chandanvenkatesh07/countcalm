import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

type Screen = 'home' | 'parent' | 'chapterIntro' | 'question';
type Chapter = 'counting' | 'additionNumbers' | 'additionPictures' | 'subtraction';

type Settings = {
  skipCounting: boolean;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  minimalAnimations: boolean;
};

type RoundQuestion = {
  promptA: number;
  promptB?: number;
  answer: number;
  options: number[];
  mode: 'counting' | 'addition-image-choice' | 'addition-drag-number';
};

type Rect = { x: number; y: number; width: number; height: number };

type LevelStat = { plays: number; clears: number; firstTryClears: number };
type DayStat = { played: number; firstTryWins: number; clears: number };
type ProgressStats = {
  gamesPlayed: number;
  firstTryWins: number;
  levelStats: Record<string, LevelStat>;
  daily: Record<string, DayStat>;
};

type ObjectTheme = {
  name: string;
  asset: any;
};

const TILE_SIZE = 184;
const APPLE_3D = require('./assets/objects/apple3d.png');
const STAR_3D = require('./assets/objects/star3d.png');
const BALL_3D = require('./assets/objects/ball3d.png');
const BLOCK_3D = require('./assets/objects/block3d.png');
const BANANA_3D = require('./assets/objects/banana3d.png');
const ORANGE_3D = require('./assets/objects/orange3d.png');
const PEAR_3D = require('./assets/objects/pear3d.png');
const STRAWBERRY_3D = require('./assets/objects/strawberry3d.png');
const BEACHBALL_3D = require('./assets/objects/beachball3d.png');
const TEDDY_3D = require('./assets/objects/teddy3d.png');
const CAR_3D = require('./assets/objects/car3d.png');
const BOOK_3D = require('./assets/objects/book3d.png');
const CUP_3D = require('./assets/objects/cup3d.png');
const FLOWER_3D = require('./assets/objects/flower3d.png');
const COOKIE_3D = require('./assets/objects/cookie3d.png');

const VOICE_CLIPS = {
  home: require('./assets/audio/instruction-home.mp3'),
  parent: require('./assets/audio/instruction-parent.mp3'),
  counting: require('./assets/audio/instruction-counting.mp3'),
  additionImage: require('./assets/audio/instruction-addition-image.mp3'),
  additionDrag: require('./assets/audio/instruction-addition-drag.mp3'),
  success: require('./assets/audio/success.mp3'),
  retry: require('./assets/audio/retry.mp3'),
  testVoice: require('./assets/audio/test-voice.mp3'),
};
const STORAGE_KEY = 'calm_count_stats_v1';

const tokens = {
  bg: '#F7F5EF', card: '#FFFFFF', text: '#244556', subtle: '#5C7B89',
  accent: '#BFE8E8', accentDeep: '#6CB9BC', warning: '#F9D4BC', border: '#D9E8ED', drop: '#E8F6FA',
};

const countingConfigs = [
  { min: 1, max: 3, optionCount: 2 },
  { min: 1, max: 5, optionCount: 3 },
  { min: 1, max: 7, optionCount: 3 },
  { min: 1, max: 10, optionCount: 3 },
  { min: 1, max: 10, optionCount: 4 },
];

const COMMON_OBJECTS: ObjectTheme[] = [
  { name: 'Apple', asset: APPLE_3D },
  { name: 'Banana', asset: BANANA_3D },
  { name: 'Marble', asset: BALL_3D },
  { name: 'Beach Ball', asset: BEACHBALL_3D },
  { name: 'Star', asset: STAR_3D },
  { name: 'Block', asset: BLOCK_3D },
  { name: 'Orange', asset: ORANGE_3D },
  { name: 'Pear', asset: PEAR_3D },
  { name: 'Strawberry', asset: STRAWBERRY_3D },
  { name: 'Teddy', asset: TEDDY_3D },
  { name: 'Car', asset: CAR_3D },
  { name: 'Book', asset: BOOK_3D },
  { name: 'Cup', asset: CUP_3D },
  { name: 'Flower', asset: FLOWER_3D },
  { name: 'Cookie', asset: COOKIE_3D },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettings] = useState<Settings>({ skipCounting: false, soundEnabled: true, voiceEnabled: true, minimalAnimations: false });
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  const [chapter, setChapter] = useState<Chapter>('counting');
  const [level, setLevel] = useState(1);
  const [question, setQuestion] = useState<RoundQuestion | null>(null);
  const [feedback, setFeedback] = useState('You can do it!');
  const [stars, setStars] = useState(0);
  const [draggingNumber, setDraggingNumber] = useState<number | null>(null);
  const [firstAttemptMissed, setFirstAttemptMissed] = useState(false);
  const [consecutiveFirstAttemptFails, setConsecutiveFirstAttemptFails] = useState(0);
  const [stats, setStats] = useState<ProgressStats>({ gamesPlayed: 0, firstTryWins: 0, levelStats: {}, daily: {} });
  const [revealedAnswer, setRevealedAnswer] = useState<number | null>(null);
  const [sparkle, setSparkle] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [optionFlash, setOptionFlash] = useState<{ value: number; status: 'wrong' | 'correct' } | null>(null);
  const [dropZoneRect, setDropZoneRect] = useState<Rect | null>(null);
  const [snappedValue, setSnappedValue] = useState<number | null>(null);
  const [objectTheme, setObjectTheme] = useState<ObjectTheme>(COMMON_OBJECTS[0]);
  const [subtractionResolved, setSubtractionResolved] = useState(false);

  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardLift = useRef(new Animated.Value(1)).current;
  const screenFade = useRef(new Animated.Value(0)).current;
  const revealScale = useRef(new Animated.Value(0.6)).current;
  const webAudioCtxRef = useRef<any>(null);
  const mascotBob = useRef(new Animated.Value(0)).current;
  const cloudAOffset = useRef(new Animated.Value(0)).current;
  const cloudBOffset = useRef(new Animated.Value(0)).current;
  const cloudCOffset = useRef(new Animated.Value(0)).current;
  const sym1 = useRef(new Animated.Value(0)).current;
  const sym2 = useRef(new Animated.Value(0)).current;
  const sym3 = useRef(new Animated.Value(0)).current;
  const subtractionSweep = useRef(new Animated.Value(0)).current;
  const subtractionTargetOpacity = useRef(new Animated.Value(1)).current;
  const dropZoneRef = useRef<View | null>(null);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTabletLandscape = isLandscape && width >= 1000;

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) { const parsed = JSON.parse(raw); setStats({ gamesPlayed: parsed.gamesPlayed ?? 0, firstTryWins: parsed.firstTryWins ?? 0, levelStats: parsed.levelStats ?? {}, daily: parsed.daily ?? {} }); }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    Animated.timing(screenFade, {
      toValue: 1,
      duration: settings.minimalAnimations ? 80 : 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => screenFade.setValue(0);
  }, [screen, settings.minimalAnimations, screenFade]);

  useEffect(() => {
    if (settings.minimalAnimations) {
      mascotBob.setValue(0);
      cloudAOffset.setValue(0);
      cloudBOffset.setValue(0);
      cloudCOffset.setValue(0);
      sym1.setValue(0);
      sym2.setValue(0);
      sym3.setValue(0);
      return;
    }

    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(mascotBob, { toValue: -8, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(mascotBob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(cloudAOffset, { toValue: 18, duration: 7000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(cloudAOffset, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(cloudBOffset, { toValue: -14, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(cloudBOffset, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(cloudCOffset, { toValue: 10, duration: 8000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(cloudCOffset, { toValue: 0, duration: 8000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(sym1, { toValue: -10, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sym1, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(sym2, { toValue: -12, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sym2, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(sym3, { toValue: -8, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sym3, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])),
    ];

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [settings.minimalAnimations, mascotBob, cloudAOffset, cloudBOffset, cloudCOffset, sym1, sym2, sym3]);

  useEffect(() => {
    if (screen === 'question') {
      setQuestion(buildQuestion(chapter, level));
      setObjectTheme(COMMON_OBJECTS[randInt(0, COMMON_OBJECTS.length - 1)]);
      setDraggingNumber(null);
      setFirstAttemptMissed(false);
      dragPos.setValue({ x: 0, y: 0 });
      setFeedback('You can do it!');
      setRevealedAnswer(null);
      setOptionFlash(null);
      setSnappedValue(null);
      setSubtractionResolved(false);
      subtractionSweep.setValue(0);
      subtractionTargetOpacity.setValue(1);
      revealScale.setValue(0.6);
      setTimeout(() => {
        dropZoneRef.current?.measureInWindow((x, y, width, height) => {
          setDropZoneRect({ x, y, width, height });
        });
      }, 40);
    }
  }, [screen, chapter, level, dragPos]);

  const shouldUseDrag = question?.mode === 'counting' || question?.mode === 'addition-drag-number' || question?.mode === 'addition-image-choice';

  function overlaps(a: Rect, b: Rect) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => dragPos.setValue({ x: g.dx, y: g.dy }),
    onPanResponderRelease: (_, g) => {
      if (!question || draggingNumber == null) return;

      const dragSize = question.mode === 'addition-image-choice' ? 132 : TILE_SIZE;
      const cardRect: Rect = {
        x: g.moveX - dragSize / 2,
        y: g.moveY - dragSize / 2,
        width: dragSize,
        height: dragSize,
      };

      const touchingDropZone = !!dropZoneRect && overlaps(cardRect, dropZoneRect);

      if (!touchingDropZone) {
        Animated.spring(dragPos, { toValue: { x: 0, y: 0 }, useNativeDriver: false, bounciness: 12 }).start();
        setDraggingNumber(null);
        return;
      }

      if (draggingNumber === question.answer) {
        setOptionFlash({ value: draggingNumber, status: 'correct' });
        setSnappedValue(draggingNumber);
        setDraggingNumber(null);
        setTimeout(() => setOptionFlash(null), 700);
        setTimeout(() => handleLevelSuccess(), 220);
      } else {
        setOptionFlash({ value: draggingNumber, status: 'wrong' });
        setTimeout(() => setOptionFlash(null), 420);
        handleWrongAttempt();
      }
    },
  }), [draggingNumber, question, dropZoneRect]);

  useEffect(() => {
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        if (!voices?.length) return;
        const scored = voices
          .map((v: any) => {
            const name = String(v.name ?? '').toLowerCase();
            const lang = String(v.language ?? '').toLowerCase();
            let score = 0;
            if (lang.startsWith('en-us')) score += 5;
            if (lang.startsWith('en-')) score += 3;
            if (name.includes('natural') || name.includes('neural') || name.includes('enhanced')) score += 5;
            if (name.includes('samantha') || name.includes('alex') || name.includes('daniel') || name.includes('zira') || name.includes('aria')) score += 3;
            if (name.includes('google')) score += 2;
            return { id: v.identifier as string, score };
          })
          .sort((a, b) => b.score - a.score);
        if (scored[0]?.id) setVoiceId(scored[0].id);
      } catch {
        // keep platform default voice
      }
    })();
  }, []);

  function playVoiceClip(clip: any) {
    if (Platform.OS !== 'web') return false;
    try {
      const src = typeof clip === 'string' ? clip : clip?.uri;
      if (!src) return false;
      const audio = new (globalThis as any).Audio(src);
      audio.volume = 1.0;
      void audio.play();
      return true;
    } catch {
      return false;
    }
  }

  function speakLine(line: string) {
    if (!settings.voiceEnabled) return;
    Speech.stop();
    Speech.speak(line, { rate: 0.95, pitch: 1.0, voice: voiceId });
  }

  function playTone(kind: 'success' | 'error', force = false) {
    if (!force && !settings.soundEnabled) return;
    if (Platform.OS !== 'web') return;
    try {
      const AudioCtx = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!webAudioCtxRef.current) webAudioCtxRef.current = new AudioCtx();
      if (webAudioCtxRef.current.state === 'suspended') void webAudioCtxRef.current.resume();

      const ctx = webAudioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'success' ? 'triangle' : 'square';
      osc.frequency.value = kind === 'success' ? 980 : 180;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.32, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'success' ? 0.36 : 0.42));

      osc.start(now);
      osc.stop(now + (kind === 'success' ? 0.38 : 0.44));
    } catch {
      // no-op if browser blocks audio context
    }
  }

  function getInstructionLine() {
    if (screen === 'home') return 'Welcome to Calm Count. Choose a learning mode. Hold Parent Zone to open settings.';
    if (screen === 'parent') return 'Parent Zone. Toggle settings and use Test Chime to confirm sound.';
    if (screen === 'chapterIntro') {
      if (chapter === 'counting') return 'Counting chapter. Drag the correct number card into the drop zone.';
      if (chapter === 'additionPictures') return 'Addition pictures chapter. Drag the correct picture card into the drop zone.';
      if (chapter === 'subtraction') return 'Subtraction chapter. Drag the correct number card into the drop zone.';
      return 'Addition numbers chapter. Drag the correct number card into the drop zone.';
    }
    if (screen === 'question' && question) {
      if (question.mode === 'counting') return 'Count the objects and drag the matching number card into the drop zone.';
      if (question.mode === 'addition-image-choice') return 'Drag the picture option with the correct total into the drop zone.';
      return chapter === 'subtraction'
        ? 'Subtract the groups and drag the correct number card into the drop zone.'
        : 'Add both groups and drag the correct number card into the drop zone.';
    }
    return 'Let’s keep learning.';
  }

  function repeatInstructions() {
    const line = getInstructionLine();
    let played = false;
    if (screen === 'home') played = playVoiceClip(VOICE_CLIPS.home);
    else if (screen === 'parent') played = playVoiceClip(VOICE_CLIPS.parent);
    else if (screen === 'chapterIntro') {
      if (chapter === 'counting') played = playVoiceClip(VOICE_CLIPS.counting);
      else if (chapter === 'additionPictures') played = playVoiceClip(VOICE_CLIPS.additionImage);
      else played = playVoiceClip(VOICE_CLIPS.additionDrag);
    } else if (screen === 'question' && question) {
      if (question.mode === 'counting') played = playVoiceClip(VOICE_CLIPS.counting);
      else if (question.mode === 'addition-image-choice') played = playVoiceClip(VOICE_CLIPS.additionImage);
      else played = playVoiceClip(VOICE_CLIPS.additionDrag);
    }
    if (!played) speakLine(line);
    if (screen === 'question') setFeedback(line);
  }

  function startChapter(ch: Chapter) {
    setChapter(ch);
    setLevel(1);
    setScreen('question');
  }

  function startLearning() {
    startChapter(settings.skipCounting ? 'additionNumbers' : 'counting');
  }

  function levelKey(ch: Chapter, lv: number) {
    const p = ch === 'counting' ? 'C' : ch === 'additionNumbers' ? 'AN' : ch === 'additionPictures' ? 'AP' : 'S';
    return `${p}${lv}`;
  }

  function updateStats(clearedOnFirstTry: boolean) {
    const key = levelKey(chapter, level);
    const today = new Date().toISOString().slice(0, 10);
    setStats((s) => {
      const prev = s.levelStats[key] ?? { plays: 0, clears: 0, firstTryClears: 0 };
      const dayPrev = s.daily[today] ?? { played: 0, firstTryWins: 0, clears: 0 };
      return {
        gamesPlayed: s.gamesPlayed + 1,
        firstTryWins: s.firstTryWins + (clearedOnFirstTry ? 1 : 0),
        levelStats: {
          ...s.levelStats,
          [key]: {
            plays: prev.plays + 1,
            clears: prev.clears + 1,
            firstTryClears: prev.firstTryClears + (clearedOnFirstTry ? 1 : 0),
          },
        },
        daily: {
          ...s.daily,
          [today]: {
            played: dayPrev.played + 1,
            clears: dayPrev.clears + 1,
            firstTryWins: dayPrev.firstTryWins + (clearedOnFirstTry ? 1 : 0),
          },
        },
      };
    });
  }

  function advanceAfterSuccess(clearedOnFirstTry: boolean) {
    updateStats(clearedOnFirstTry);

    const nextFailStreak = clearedOnFirstTry ? 0 : consecutiveFirstAttemptFails + 1;

    if (nextFailStreak >= 3) {
      const newLevel = Math.max(1, level - 3);
      setConsecutiveFirstAttemptFails(0);
      setLevel(newLevel);
      setFeedback('Let’s redo some levels to ensure we understood the concept.');
      setTimeout(() => setScreen('question'), 1100);
      return;
    }

    setConsecutiveFirstAttemptFails(nextFailStreak);

    if (chapter === 'counting') {
      if (level < 5) {
        setLevel((l) => l + 1);
        setTimeout(() => setScreen('question'), 650);
      } else {
        setChapter('additionNumbers');
        setLevel(1);
        setScreen('question');
      }
      return;
    }

    if (level < 10) {
      setLevel((l) => l + 1);
      setTimeout(() => setScreen('question'), 650);
    } else {
      setFeedback('Amazing work!');
      setScreen('home');
    }
  }

  function handleLevelSuccess() {
    if (!question) return;
    const firstTry = !firstAttemptMissed;
    const successLine = chapter === 'counting'
      ? `Yes! ${question.answer}. Great job!`
      : chapter === 'subtraction'
      ? `Yes! ${question.promptA} minus ${question.promptB} is ${question.answer}. Great job!`
      : `Yes! ${question.promptA} plus ${question.promptB} is ${question.answer}. Great job!`;

    if (question.mode === 'addition-image-choice') {
      setRevealedAnswer(question.answer);
      revealScale.setValue(0.6);
      Animated.sequence([
        Animated.spring(revealScale, { toValue: 1.2, useNativeDriver: true, bounciness: 10 }),
        Animated.spring(revealScale, { toValue: 1, useNativeDriver: true, bounciness: 6 }),
        Animated.timing(revealScale, { toValue: 1.08, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(revealScale, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start();
    }

    if (chapter === 'subtraction' && question.mode === 'addition-drag-number') {
      setSubtractionResolved(false);
      subtractionSweep.setValue(0);
      subtractionTargetOpacity.setValue(1);
      Animated.sequence([
        Animated.timing(subtractionSweep, { toValue: 74, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(subtractionTargetOpacity, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(subtractionSweep, { toValue: 0, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        setSubtractionResolved(true);
        subtractionTargetOpacity.setValue(1);
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playTone('success');
    if (!playVoiceClip(VOICE_CLIPS.success)) speakLine(successLine);
    setSparkle(true);
    setConfettiKey((k) => k + 1);
    setTimeout(() => setSparkle(false), 900);
    setFeedback(successLine);
    setStars((s) => s + 1);
    Animated.sequence([
      Animated.spring(cardLift, { toValue: 1.08, useNativeDriver: true, bounciness: 8 }),
      Animated.spring(cardLift, { toValue: 1, useNativeDriver: true, bounciness: 6 }),
    ]).start();
    const waitMs = question.mode === 'addition-image-choice'
      ? 3200
      : settings.voiceEnabled
      ? 2400
      : 1300;
    setTimeout(() => advanceAfterSuccess(firstTry), waitMs);
  }

  function handleWrongAttempt() {
    if (!firstAttemptMissed) setFirstAttemptMissed(true);
    setDraggingNumber(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    playTone('error');
    if (!playVoiceClip(VOICE_CLIPS.retry)) speakLine("Nice try. Let's try again.");
    setFeedback('Nice try. Let’s try again.');
    Animated.parallel([
      Animated.spring(dragPos, { toValue: { x: 0, y: 0 }, useNativeDriver: false, bounciness: 14 }),
      Animated.sequence([
        Animated.timing(cardLift, { toValue: 0.96, duration: 90, useNativeDriver: true }),
        Animated.timing(cardLift, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]),
    ]).start();
  }

  function handleImageChoice(choice: number) {
    if (!question) return;
    if (choice === question.answer) {
      handleLevelSuccess();
    } else {
      handleWrongAttempt();
    }
  }

  async function resetProgress() {
    const blank = { gamesPlayed: 0, firstTryWins: 0, levelStats: {}, daily: {} };
    setStats(blank);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(blank));
    setFeedback('Progress reset done.');
  }

  const firstTryRate = stats.gamesPlayed ? Math.round((stats.firstTryWins / stats.gamesPlayed) * 100) : 0;

  const masteryLabels = getMasteryLabels(stats.levelStats);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <Animated.View style={[styles.screen, isTabletLandscape && styles.screenWide, { opacity: screenFade }]}>
        {screen !== 'question' && (
          <View style={styles.soundToolsRow}>
            <Pressable style={styles.miniBtn} onPress={repeatInstructions}>
              <MaterialCommunityIcons name="bullhorn-outline" size={18} color="#12404A" />
              <Text style={styles.miniBtnText}>Repeat instructions</Text>
            </Pressable>
            <Pressable style={styles.miniBtn} onPress={() => { playTone('success', true); if (!playVoiceClip(VOICE_CLIPS.testVoice)) speakLine('Test chime and voice are working.'); }}>
              <MaterialCommunityIcons name="music-note" size={18} color="#12404A" />
              <Text style={styles.miniBtnText}>Test chime</Text>
            </Pressable>
          </View>
        )}
        {showIntro && (
          <View style={styles.introOverlay}>
            <Text style={styles.introTitle}>Welcome to Calm Count</Text>
            <Text style={styles.introText}>Tap, drag, and learn with beautiful 3D objects. Parent zone has progress insights.</Text>
            <PrimaryButton title="Let’s Begin" icon="party-popper" onPress={() => setShowIntro(false)} />
          </View>
        )}
        {screen === 'home' && (
          <View style={styles.homeWrap}>
            <View style={styles.sceneSun} />
            <Animated.View style={[styles.sceneCloud, styles.sceneCloudA, { transform: [{ translateX: cloudAOffset }] }]} />
            <Animated.View style={[styles.sceneCloud, styles.sceneCloudB, { transform: [{ translateX: cloudBOffset }] }]} />
            <Animated.View style={[styles.sceneCloud, styles.sceneCloudC, { transform: [{ translateX: cloudCOffset }] }]} />
            <Animated.Text style={[styles.floatSymbol, styles.floatSymbol1, { transform: [{ translateY: sym1 }] }]}>+</Animated.Text>
            <Animated.Text style={[styles.floatSymbol, styles.floatSymbol2, { transform: [{ translateY: sym2 }] }]}>=</Animated.Text>
            <Animated.Text style={[styles.floatSymbol, styles.floatSymbol3, { transform: [{ translateY: sym3 }] }]}>★</Animated.Text>
            <View style={styles.sceneHills} />

            <Text style={styles.homeTitle}>Calm Count</Text>
            <Text style={styles.homeSubtitle}>Beautiful, calm math learning for ages 4–6</Text>
            <Animated.View style={[styles.mascotWrap, { transform: [{ translateY: mascotBob }] }]}> 
              <Text style={styles.mascot}>🦊</Text>
              <View style={styles.mascotSpeech}><Text style={styles.mascotSpeechText}>Let’s learn math! 🎉</Text></View>
            </Animated.View>

            <View style={styles.homeModeGrid}>
              <HomeModeCard title="Counting" icon="numeric" onPress={() => startChapter('counting')} />
              <HomeModeCard title="Addition (Numbers)" icon="plus-circle-outline" onPress={() => startChapter('additionNumbers')} />
              <HomeModeCard title="Addition (Pictures)" icon="shape-outline" onPress={() => startChapter('additionPictures')} />
              <HomeModeCard title="Subtraction" icon="minus-circle-outline" onPress={() => startChapter('subtraction')} />
            </View>

            <Pressable style={styles.homeParentBtn} onLongPress={() => setScreen('parent')} delayLongPress={600}>
              <MaterialCommunityIcons name="account-cog-outline" size={20} color="#587587" />
              <Text style={styles.homeParentText}>Parent Zone (hold)</Text>
            </Pressable>
          </View>
        )}

        {screen === 'parent' && (
          <ScrollView contentContainerStyle={{ alignItems: 'center', gap: 12, paddingBottom: 40 }} style={{ width: '100%' }}>
            <Text style={styles.title}>Parent Zone</Text>
            <SettingRow label="Child knows counting (Skip chapter)" value={settings.skipCounting} onChange={(v) => setSettings((s) => ({ ...s, skipCounting: v }))} />
            <SettingRow label="Sound" value={settings.soundEnabled} onChange={(v) => setSettings((s) => ({ ...s, soundEnabled: v }))} />
            <SettingRow label="Voice prompts" value={settings.voiceEnabled} onChange={(v) => setSettings((s) => ({ ...s, voiceEnabled: v }))} />
            {!!voiceId && <Text style={[styles.statsLine, { width: '100%', maxWidth: 780 }]}>Voice: {voiceId}</Text>}
            <SettingRow label="Minimal animations" value={settings.minimalAnimations} onChange={(v) => setSettings((s) => ({ ...s, minimalAnimations: v }))} />

            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>Progress Tracker (Local on iPad)</Text>
              <Text style={styles.statsLine}>Games played: {stats.gamesPlayed}</Text>
              <Text style={styles.statsLine}>First-attempt wins: {stats.firstTryWins} ({firstTryRate}%)</Text>
              <Text style={styles.statsLine}>Current chapter/level: {chapter} {level}</Text>
              <Text style={[styles.statsLine, { marginTop: 8, fontWeight: '800' }]}>Level consistency graph</Text>
              {renderLevelGraph(stats.levelStats)}
              <Text style={[styles.statsLine, { marginTop: 10, fontWeight: '800' }]}>Last 7 days trend</Text>
              {renderDailyGraph(stats.daily)}
              <Text style={[styles.statsLine, { marginTop: 10, fontWeight: '800' }]}>Mastery badges</Text>
              <Text style={styles.statsLine}>{masteryLabels.join(' • ') || 'Play more to unlock badges'}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <PrimaryButton title="Save & Home" icon="home-outline" onPress={() => setScreen('home')} />
              <Pressable style={styles.resetBtn} onPress={resetProgress}>
                <MaterialCommunityIcons name="restore" size={20} color="#7A2D2D" />
                <Text style={styles.resetText}>Reset Data</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {screen === 'chapterIntro' && (
          <>
            <Text style={styles.title}>{chapter === 'counting' ? 'Counting Chapter' : chapter === 'additionPictures' ? 'Addition Pictures Chapter' : chapter === 'subtraction' ? 'Subtraction Chapter' : 'Addition Numbers Chapter'}</Text>
            <Text style={styles.subtitle}>Drag the right answer into the square.</Text>
            <PrimaryButton title={`Start Level ${level}`} icon="rocket-launch-outline" onPress={() => setScreen('question')} />
          </>
        )}

        {screen === 'question' && question && (
          <>
            <View style={styles.topBar}>
              <Text style={styles.levelLabel}>{chapter === 'counting' ? `Counting ${level}/5` : chapter === 'additionPictures' ? `Addition Pictures ${level}/10` : chapter === 'subtraction' ? `Subtraction ${level}/10` : `Addition Numbers ${level}/10`}</Text>
              <View style={styles.starPill}><MaterialCommunityIcons name="star" size={18} color="#B58400" /><Text style={styles.starText}>{stars}</Text></View>
            </View>

            <View style={[styles.gameBoard, (chapter === 'additionNumbers' || chapter === 'additionPictures') && styles.gameBoardAdventure]}>
              {question.mode !== 'counting' && (
                <View style={styles.equationBoard}>
                  <View style={styles.equationAlignRow}>
                    <View style={styles.promptGroup}><Text style={styles.equationText}>{question.promptA}</Text></View>
                    <View style={styles.symbolSlot}><Text style={styles.equationText}>{chapter === 'subtraction' ? '−' : '+'}</Text></View>
                    <View style={styles.promptGroup}><Text style={styles.equationText}>{question.promptB}</Text></View>
                    <View style={styles.symbolSlot}><Text style={styles.equationText}>=</Text></View>
                    <View style={styles.inlineDropZoneGhost}><Text style={styles.equationText}>?</Text></View>
                  </View>
                </View>
              )}

              <View style={styles.promptBox}>
                {question.mode === 'counting' ? (
                  renderObjectRows(question.answer, objectTheme, 5, 150)
                ) : chapter === 'additionNumbers' ? (
                  <View style={styles.additionAdventureRow}>
                    <View style={styles.eqSlotWide}>
                      <View style={styles.eqCol}>
                        {renderObjectSprites(question.promptA, objectTheme, 4, 58)}
                        <Text style={styles.eqCountBlue}>{question.promptA} {objectTheme.name}{question.promptA === 1 ? '' : 's'}</Text>
                      </View>
                    </View>
                    <View style={styles.eqSlotNarrow}><Text style={styles.eqOp}>+</Text></View>
                    <View style={styles.eqSlotWide}>
                      <View style={styles.eqCol}>
                        {renderObjectSprites(question.promptB ?? 0, objectTheme, 4, 58)}
                        <Text style={styles.eqCountPink}>{question.promptB} {objectTheme.name}{(question.promptB ?? 0) === 1 ? '' : 's'}</Text>
                      </View>
                    </View>
                    <View style={styles.eqSlotNarrow}><Text style={styles.eqOp}>=</Text></View>
                    <View style={styles.eqSlotWide}>
                      <View style={styles.eqCol}>
                        <View
                          ref={(r) => { dropZoneRef.current = r; }}
                          onLayout={() => {
                            dropZoneRef.current?.measureInWindow((x, y, width, height) => {
                              setDropZoneRect({ x, y, width, height });
                            });
                          }}
                          style={styles.adventureDropZone}
                        >
                          {snappedValue == null ? (
                            <Text style={styles.adventureDropText}>❓</Text>
                          ) : (
                            <Text style={styles.adventureDropTextFilled}>{snappedValue}</Text>
                          )}
                        </View>
                        <Text style={styles.eqCountQuestion}>{snappedValue == null ? '?' : `${snappedValue} ${objectTheme.name}${snappedValue === 1 ? '' : 's'}`}</Text>
                      </View>
                    </View>
                  </View>
                ) : chapter === 'additionPictures' ? (
                  <View style={styles.additionAdventureRow}>
                    <View style={styles.eqSlotWide}>
                      <View style={styles.eqCol}>
                        {renderObjectSprites(question.promptA, objectTheme, 4, 58)}
                        <Text style={styles.eqCountBlue}>{question.promptA} {objectTheme.name}{question.promptA === 1 ? '' : 's'}</Text>
                      </View>
                    </View>
                    <View style={styles.eqSlotNarrow}><Text style={styles.eqOp}>+</Text></View>
                    <View style={styles.eqSlotWide}>
                      <View style={styles.eqCol}>
                        {renderObjectSprites(question.promptB ?? 0, objectTheme, 4, 58)}
                        <Text style={styles.eqCountPink}>{question.promptB} {objectTheme.name}{(question.promptB ?? 0) === 1 ? '' : 's'}</Text>
                      </View>
                    </View>
                    <View style={styles.eqSlotNarrow}><Text style={styles.eqOp}>=</Text></View>
                    <View style={styles.eqSlotWide}>
                      <View style={styles.eqCol}>
                        <View
                          ref={(r) => { dropZoneRef.current = r; }}
                          onLayout={() => {
                            dropZoneRef.current?.measureInWindow((x, y, width, height) => {
                              setDropZoneRect({ x, y, width, height });
                            });
                          }}
                          style={styles.adventureDropZone}
                        >
                          {snappedValue == null ? (
                            <Text style={styles.adventureDropText}>❓</Text>
                          ) : (
                            <Text style={styles.adventureDropTextFilled}>{snappedValue}</Text>
                          )}
                        </View>
                        <Text style={styles.eqCountQuestion}>{snappedValue == null ? '?' : `${snappedValue} ${objectTheme.name}${snappedValue === 1 ? '' : 's'}`}</Text>
                      </View>
                    </View>
                  </View>
                ) : chapter === 'subtraction' ? (
                  <View style={styles.additionPromptRow}>
                    <View style={styles.promptGroup}>{renderObjectRows(subtractionResolved ? question.answer : question.promptA, objectTheme, 4, 92)}</View>
                    <View style={styles.symbolSlot}>
                      <Animated.Text style={[styles.plusSign, { transform: [{ translateX: subtractionSweep }] }]}>−</Animated.Text>
                    </View>
                    <Animated.View style={[styles.promptGroup, { opacity: subtractionTargetOpacity }]}>
                      {renderObjectRows(subtractionResolved ? 0 : (question.promptB ?? 0), objectTheme, 4, 92)}
                    </Animated.View>
                    <View style={styles.symbolSlot}><Text style={styles.plusSign}>=</Text></View>
                    <View
                      ref={(r) => { dropZoneRef.current = r; }}
                      onLayout={() => {
                        dropZoneRef.current?.measureInWindow((x, y, width, height) => {
                          setDropZoneRect({ x, y, width, height });
                        });
                      }}
                      style={styles.inlineDropZone}
                    >
                      {snappedValue == null ? (
                        <MaterialCommunityIcons name="help" size={30} color={tokens.subtle} />
                      ) : (
                        <LinearGradient colors={['#DDF8E1', '#ACEBB7', '#79DB8B']} start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 1 }} style={styles.snapCard}>
                          <View style={styles.bagKnot} />
                          <View style={styles.numberInnerGlow} />
                          <Text selectable={false} style={styles.snapCardText}>{snappedValue}</Text>
                        </LinearGradient>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.additionPromptRow}>
                    <View style={styles.promptGroup}>{renderObjectRows(question.promptA, objectTheme, 4, 92)}</View>
                    <View style={styles.symbolSlot}><Text style={styles.plusSign}>+</Text></View>
                    <View style={styles.promptGroup}>{renderObjectRows(question.promptB ?? 0, objectTheme, 4, 92)}</View>
                    <View style={styles.symbolSlot}><Text style={styles.plusSign}>=</Text></View>
                    <View
                      ref={(r) => { dropZoneRef.current = r; }}
                      onLayout={() => {
                        dropZoneRef.current?.measureInWindow((x, y, width, height) => {
                          setDropZoneRect({ x, y, width, height });
                        });
                      }}
                      style={styles.inlineDropZone}
                    >
                      {snappedValue == null ? (
                        <MaterialCommunityIcons name="help" size={30} color={tokens.subtle} />
                      ) : (
                        <LinearGradient colors={['#DDF8E1', '#ACEBB7', '#79DB8B']} start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 1 }} style={styles.snapCard}>
                          <View style={styles.bagKnot} />
                          <View style={styles.numberInnerGlow} />
                          <Text selectable={false} style={styles.snapCardText}>{snappedValue}</Text>
                        </LinearGradient>
                      )}
                    </View>
                  </View>
                )}
              </View>

              {question.mode === 'addition-image-choice' && revealedAnswer !== null && (
                <View style={styles.answerRevealWrap}>
                  <Text style={styles.answerRevealText}>Great! That is</Text>
                  <Animated.View style={{ transform: [{ scale: revealScale }] }}>
                    <LinearGradient colors={['#BFE8FF', '#8FD2FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.answerRevealBadge}>
                      <Text style={styles.answerRevealNumber}>{revealedAnswer}</Text>
                    </LinearGradient>
                  </Animated.View>
                </View>
              )}

              {question.mode === 'counting' && (
                <View style={styles.dropZoneWrap}>
                  <View
                    ref={(r) => { dropZoneRef.current = r; }}
                    onLayout={() => {
                      dropZoneRef.current?.measureInWindow((x, y, width, height) => {
                        setDropZoneRect({ x, y, width, height });
                      });
                    }}
                    style={styles.dropZone}
                  >
                    {snappedValue == null ? (
                      <MaterialCommunityIcons name="tray-arrow-down" size={32} color={tokens.subtle} />
                    ) : (
                      <LinearGradient
                        colors={['#DDF8E1', '#ACEBB7', '#79DB8B']}
                        start={{ x: 0.1, y: 0.1 }}
                        end={{ x: 0.9, y: 1 }}
                        style={styles.snapCard}
                      >
                        <View style={styles.bagKnot} />
                        <View style={styles.numberInnerGlow} />
                        <Text selectable={false} style={styles.snapCardText}>{snappedValue}</Text>
                      </LinearGradient>
                    )}
                  </View>
                </View>
              )}

              {question.mode === 'addition-image-choice' ? (
                <View style={styles.optionRow}>
                  {question.options.map((opt) => {
                    const flash = optionFlash?.value === opt ? optionFlash.status : null;
                    return (
                      <Animated.View
                        key={opt}
                        style={[
                          styles.choiceCardWrap,
                          snappedValue === opt ? { opacity: 0 } : undefined,
                          draggingNumber === opt ? dragPos.getLayout() : undefined,
                          draggingNumber === opt ? { transform: [{ scale: cardLift }] } : undefined,
                          flash === 'wrong' ? styles.choiceCardWrong : undefined,
                          flash === 'correct' ? styles.choiceCardCorrect : undefined,
                        ]}
                        {...(draggingNumber === opt ? panResponder.panHandlers : {})}
                      >
                        <Pressable
                          style={styles.choiceCard}
                          onPressIn={() => { setDraggingNumber(opt); dragPos.setValue({ x: 0, y: 0 }); cardLift.setValue(1.03); }}
                        >
                          {renderObjectSprites(opt, objectTheme, 4, 34)}
                          <Text style={styles.choiceCount}>{opt} {objectTheme.name}{opt === 1 ? '' : 's'}</Text>
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.optionRow}>
                  {question.options.map((opt, idx) => {
                    const flash = optionFlash?.value === opt ? optionFlash.status : null;
                    const cardColors = flash === 'wrong'
                      ? (['#FFDADB', '#FFA7AB', '#FF7C82'] as [string, string, string])
                      : flash === 'correct'
                      ? (['#DDF8E1', '#ACEBB7', '#79DB8B'] as [string, string, string])
                      : bagColors(idx);

                    return (
                      <Animated.View
                        key={opt}
                        style={[
                          styles.numberCardWrap,
                          snappedValue === opt ? { opacity: 0 } : undefined,
                          draggingNumber === opt ? dragPos.getLayout() : undefined,
                          draggingNumber === opt ? { transform: [{ scale: cardLift }] } : undefined,
                        ]}
                        {...(draggingNumber === opt ? panResponder.panHandlers : {})}
                      >
                        <Pressable style={styles.fullCardPress} onPressIn={() => { setDraggingNumber(opt); dragPos.setValue({ x: 0, y: 0 }); cardLift.setValue(1.03); }}>
                          <LinearGradient colors={cardColors} start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 1 }} style={styles.numberCard}>
                            <View style={styles.bagKnot} />
                            <View style={styles.numberInnerGlow} />
                            <Text selectable={false} style={styles.numberText}>{opt}</Text>
                          </LinearGradient>
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              )}

              {/* inline repeat removed */}

              <View style={styles.feedbackPill}><MaterialCommunityIcons name="message-text-outline" size={20} color={tokens.subtle} /><Text style={styles.feedback}>{feedback}</Text>{sparkle && <Text style={styles.sparkles}> ✨ ⭐ 🎉 ✨</Text>}</View>
            </View>
            {sparkle && <ConfettiBurst key={confettiKey} />}
          </>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

function ConfettiBurst() {
  const y1 = useRef(new Animated.Value(0)).current;
  const y2 = useRef(new Animated.Value(0)).current;
  const y3 = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y1, { toValue: -140, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(y2, { toValue: -170, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(y3, { toValue: -120, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start();
  }, [op, y1, y2, y3]);

  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      <Animated.Text style={[styles.confettiPiece, { left: '40%', transform: [{ translateY: y1 }, { rotate: '25deg' }], opacity: op }]}>🎉</Animated.Text>
      <Animated.Text style={[styles.confettiPiece, { left: '50%', transform: [{ translateY: y2 }, { rotate: '-15deg' }], opacity: op }]}>✨</Animated.Text>
      <Animated.Text style={[styles.confettiPiece, { left: '60%', transform: [{ translateY: y3 }, { rotate: '10deg' }], opacity: op }]}>⭐</Animated.Text>
    </View>
  );
}

function renderLevelGraph(levelStats: Record<string, LevelStat>) {
  const keys = Object.keys(levelStats).sort((a, b) => {
    const na = parseInt(a.slice(1), 10); const nb = parseInt(b.slice(1), 10);
    if (a[0] === b[0]) return na - nb;
    return a[0].localeCompare(b[0]);
  });
  if (!keys.length) return <Text style={styles.statsLine}>No data yet.</Text>;
  return (
    <View style={{ width: '100%', gap: 6, marginTop: 6 }}>
      {keys.map((k) => {
        const s = levelStats[k];
        const pct = s.plays ? Math.round((s.firstTryClears / s.plays) * 100) : 0;
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: 34, color: tokens.text, fontWeight: '700' }}>{k}</Text>
            <View style={{ flex: 1, height: 12, backgroundColor: '#E9F1F4', borderRadius: 999 }}>
              <View style={{ width: `${pct}%`, height: 12, backgroundColor: '#8FD0B0', borderRadius: 999 }} />
            </View>
            <Text style={{ width: 44, textAlign: 'right', color: tokens.subtle }}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

function renderDailyGraph(daily: Record<string, DayStat>) {
  const out: { day: string; played: number; rate: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const v = daily[key] ?? { played: 0, firstTryWins: 0, clears: 0 };
    const rate = v.played ? Math.round((v.firstTryWins / v.played) * 100) : 0;
    out.push({ day: label, played: v.played, rate });
  }

  return (
    <View style={{ width: '100%', marginTop: 4, gap: 6 }}>
      {out.map((d) => (
        <View key={d.day} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ width: 44, color: tokens.text, fontWeight: '700' }}>{d.day}</Text>
          <View style={{ flex: 1, height: 12, backgroundColor: '#E9F1F4', borderRadius: 999 }}>
            <View style={{ width: `${d.rate}%`, height: 12, backgroundColor: '#8CAEEA', borderRadius: 999 }} />
          </View>
          <Text style={{ width: 72, textAlign: 'right', color: tokens.subtle }}>{d.played} plays</Text>
          <Text style={{ width: 44, textAlign: 'right', color: tokens.subtle }}>{d.rate}%</Text>
        </View>
      ))}
    </View>
  );
}

function PrimaryButton({ title, icon, onPress }: { title: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }) {
  return <Pressable style={styles.primaryButton} onPress={onPress}><MaterialCommunityIcons name={icon} size={22} color="#12404A" /><Text style={styles.primaryText}>{title}</Text></Pressable>;
}

function HomeModeCard({ title, icon, onPress }: { title: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }) {
  return (
    <Pressable style={styles.homeModeCard} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={22} color="#154A66" />
      <Text style={styles.homeModeText}>{title}</Text>
    </Pressable>
  );
}

function SettingRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={styles.settingRow}><Text style={styles.settingLabel}>{label}</Text><Switch value={value} onValueChange={onChange} /></View>;
}

function buildQuestion(chapter: Chapter, level: number): RoundQuestion {
  if (chapter === 'counting') {
    const cfg = countingConfigs[Math.max(0, Math.min(4, level - 1))];
    const answer = randInt(cfg.min, cfg.max);
    return { promptA: answer, answer, options: numberOptions(answer, cfg.optionCount, cfg.min, cfg.max), mode: 'counting' };
  }

  if (chapter === 'additionPictures') {
    const max = Math.min(10, Math.max(4, level + 1));
    const a = randInt(1, max - 1); const b = randInt(1, max - a); const answer = a + b;
    return { promptA: a, promptB: b, answer, options: numberOptions(answer, level < 10 ? 3 : 4, 1, 10), mode: 'addition-image-choice' };
  }

  if (chapter === 'subtraction') {
    const max = Math.min(10, Math.max(4, level + 1));
    const a = randInt(2, max); const b = randInt(1, a - 1); const answer = a - b;
    return { promptA: a, promptB: b, answer, options: numberOptions(answer, level < 10 ? 3 : 4, 0, 9), mode: 'addition-drag-number' };
  }

  const max = Math.min(10, Math.max(4, level + 1));
  const a = randInt(1, max - 1); const b = randInt(1, max - a); const answer = a + b;
  return { promptA: a, promptB: b, answer, options: numberOptions(answer, level < 10 ? 3 : 4, 1, 10), mode: 'addition-drag-number' };
}

function numberOptions(answer: number, count: number, min: number, max: number) {
  const set = new Set<number>([answer]);
  while (set.size < count) set.add(randInt(min, max));
  return Array.from(set).sort(() => Math.random() - 0.5);
}

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function bagColors(idx: number): [string, string, string] {
  const palettes: [string, string, string][] = [
    ['#FFECC8', '#FFD29A', '#FFB978'],
    ['#E7F2FF', '#C5DFFF', '#9CC5FF'],
    ['#FDE3F5', '#F9BFE8', '#EC97D6'],
    ['#E4F9E8', '#B9EDC4', '#8EDFA3'],
  ];
  return palettes[idx % palettes.length];
}

function renderObjectRows(count: number, theme: ObjectTheme, perRow = 5, iconSize = 72) {
  const rows: number[] = [];
  for (let i = 0; i < count; i += perRow) rows.push(Math.min(perRow, count - i));
  return (
    <View style={styles.appleRows}>
      {rows.map((n, idx) => (
        <View key={`${count}-${idx}`} style={styles.appleRow}>
          {Array.from({ length: n }).map((_, j) => (
            <View key={j} style={styles.objectTile}>
              <Image
                source={theme.asset}
                style={[styles.appleIcon3d, { width: iconSize, height: iconSize }]}
                resizeMode="contain"
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function renderBallRows(count: number, tone: 'blue' | 'pink' | 'purple', perRow = 4, size = 46) {
  const rows: number[] = [];
  for (let i = 0; i < count; i += perRow) rows.push(Math.min(perRow, count - i));
  return (
    <View style={styles.ballRows}>
      {rows.map((n, idx) => (
        <View key={`${tone}-${count}-${idx}`} style={styles.ballRow}>
          {Array.from({ length: n }).map((_, j) => (
            <View
              key={j}
              style={[
                styles.ball,
                tone === 'blue' ? styles.ballBlue : tone === 'pink' ? styles.ballPink : styles.ballPurple,
                { width: size, height: size, borderRadius: size / 2 },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function renderObjectSprites(count: number, theme: ObjectTheme, perRow = 4, size = 56) {
  const rows: number[] = [];
  for (let i = 0; i < count; i += perRow) rows.push(Math.min(perRow, count - i));
  return (
    <View style={styles.ballRows}>
      {rows.map((n, idx) => (
        <View key={`${theme.name}-${count}-${idx}`} style={styles.ballRow}>
          {Array.from({ length: n }).map((_, j) => (
            <Image key={j} source={theme.asset} style={[styles.objectSprite, { width: size, height: size }]} resizeMode="contain" />
          ))}
        </View>
      ))}
    </View>
  );
}

function getMasteryLabels(levelStats: Record<string, LevelStat>) {
  const labels: string[] = [];
  const entries = Object.entries(levelStats);
  const strong = entries.filter(([,v]) => v.plays >= 3 && (v.firstTryClears / v.plays) >= 0.8).length;
  if (strong >= 3) labels.push('Consistency Star');
  const countingStrong = entries.filter(([k,v]) => k.startsWith('C') && v.plays >= 3 && (v.firstTryClears / v.plays) >= 0.75).length;
  if (countingStrong >= 2) labels.push('Counting Master');
  const addStrong = entries.filter(([k,v]) => k.startsWith('A') && v.plays >= 3 && (v.firstTryClears / v.plays) >= 0.75).length;
  if (addStrong >= 3) labels.push('Addition Pro');
  return labels;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  screenWide: { paddingHorizontal: 36, paddingVertical: 18 },
  introOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(247,245,239,0.96)', zIndex: 50, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  introTitle: { fontSize: 42, fontWeight: '900', color: tokens.text, textAlign: 'center' },
  introText: { fontSize: 20, color: tokens.subtle, textAlign: 'center', maxWidth: 760, lineHeight: 30 },
  soundToolsRow: { width: '100%', maxWidth: 920, flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' },
  miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D8EEF4', borderWidth: 1, borderColor: '#AED5DE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  miniBtnText: { color: '#12404A', fontWeight: '700' },
  title: { fontSize: 44, fontWeight: '800', color: tokens.text, textAlign: 'center' },
  subtitle: { fontSize: 20, color: tokens.subtle, textAlign: 'center', maxWidth: 760, lineHeight: 29 },
  homeWrap: {
    width: '100%',
    maxWidth: 1060,
    minHeight: 560,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 34,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#BFE8FF',
    borderWidth: 1,
    borderColor: '#98D2F2',
  },
  sceneSun: {
    position: 'absolute',
    top: 24,
    right: 42,
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#FFD93D',
    shadowColor: '#FFD93D',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  sceneCloud: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999 },
  sceneCloudA: { top: 52, left: 40, width: 130, height: 44 },
  sceneCloudB: { top: 122, right: 140, width: 96, height: 34 },
  sceneCloudC: { top: 174, left: 180, width: 112, height: 36 },
  floatSymbol: { position: 'absolute', fontSize: 40, fontWeight: '900', color: 'rgba(255,255,255,0.30)' },
  floatSymbol1: { left: 120, top: 110 },
  floatSymbol2: { right: 170, top: 180 },
  floatSymbol3: { left: 260, top: 210 },
  sceneHills: {
    position: 'absolute',
    left: -40,
    right: -40,
    bottom: -65,
    height: 170,
    borderTopLeftRadius: 220,
    borderTopRightRadius: 220,
    backgroundColor: '#93E06F',
  },
  homeTitle: { fontSize: 64, fontWeight: '900', color: '#1D4E72', textAlign: 'center', marginTop: 12 },
  homeSubtitle: { fontSize: 18, color: '#3D6A84', textAlign: 'center', marginTop: 8, marginBottom: 10 },
  mascotWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  mascot: { fontSize: 96 },
  mascotSpeech: { position: 'absolute', right: -110, top: 8, backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#D9ECF7' },
  mascotSpeechText: { color: '#37596D', fontWeight: '700', fontSize: 14 },
  homeModeGrid: { width: '100%', maxWidth: 920, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  homeModeCard: {
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: '#A7DBE1',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#88C9D1',
  },
  homeModeText: { fontSize: 22, fontWeight: '800', color: '#13445E' },
  homeParentBtn: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#EAE6DA', borderRadius: 14 },
  homeParentText: { fontSize: 17, color: '#587587' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: tokens.accent, borderColor: '#A8D8DA', borderWidth: 1, minWidth: 260, paddingVertical: 16, paddingHorizontal: 22, borderRadius: 20 },
  primaryText: { fontSize: 24, fontWeight: '700', color: '#12404A' },
  modeGrid: { width: '100%', maxWidth: 920, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  parentBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#ECE8DC', borderRadius: 14 },
  parentText: { fontSize: 18, color: tokens.subtle },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: 780, alignItems: 'center', backgroundColor: tokens.card, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: tokens.border },
  settingLabel: { fontSize: 20, color: tokens.text, width: '80%' },
  statsCard: { width: '100%', maxWidth: 780, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: tokens.border, padding: 16 },
  statsTitle: { fontSize: 22, fontWeight: '800', color: tokens.text, marginBottom: 4 },
  statsLine: { fontSize: 17, color: tokens.subtle, lineHeight: 25 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E6B6B6', backgroundColor: '#FFEFEF' },
  resetText: { color: '#7A2D2D', fontWeight: '700' },
  topBar: { width: '100%', maxWidth: 1180, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gameBoard: { width: '100%', maxWidth: 1180, backgroundColor: '#F5FBFD', borderRadius: 22, borderWidth: 1, borderColor: '#DDEFF5', padding: 14, gap: 14 },
  gameBoardAdventure: { backgroundColor: '#FFFFFF', borderColor: '#C6DFFA', shadowColor: '#3F6EA0', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  levelLabel: { fontSize: 23, color: tokens.text, fontWeight: '800' },
  starPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF2C8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  starText: { fontSize: 18, fontWeight: '700', color: '#8C6500' },
  equationBoard: { width: '100%', backgroundColor: '#2C7F5E', borderRadius: 18, borderWidth: 3, borderColor: '#8B6D42', paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  equationAlignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' },
  equationText: { fontSize: 50, fontWeight: '900', color: '#E8FFF2', textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2, lineHeight: 56 },
  promptBox: { backgroundColor: '#BDEEFF', borderRadius: 28, paddingHorizontal: 26, paddingVertical: 18, minHeight: 124, justifyContent: 'center', borderWidth: 1, borderColor: '#99D6EB' },
  additionAdventureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', backgroundColor: '#1A2750', borderRadius: 22, paddingVertical: 16, paddingHorizontal: 12 },
  eqCol: { alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 84 },
  eqSlotWide: { width: 200, alignItems: 'center', justifyContent: 'center' },
  eqSlotNarrow: { width: 70, alignItems: 'center', justifyContent: 'center' },
  eqNum: { fontSize: 46, fontWeight: '900', lineHeight: 52, fontFamily: Platform.OS === 'ios' ? 'Avenir-Heavy' : undefined },
  eqNumBlue: { color: '#7DD3FC' },
  eqNumPink: { color: '#FDA4AF' },
  eqNumQuestion: { color: '#FBBF24' },
  eqOp: { fontSize: 34, fontWeight: '900', color: 'rgba(255,255,255,0.45)' },
  eqCountBlue: { fontSize: 12, textTransform: 'uppercase', fontWeight: '800', color: 'rgba(125,211,252,0.8)' },
  eqCountPink: { fontSize: 12, textTransform: 'uppercase', fontWeight: '800', color: 'rgba(253,164,175,0.8)' },
  eqCountQuestion: { fontSize: 12, textTransform: 'uppercase', fontWeight: '800', color: 'rgba(251,191,36,0.75)' },
  adventureDropZone: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 24, borderWidth: 3, borderStyle: 'dashed', borderColor: 'rgba(167,139,250,0.8)', backgroundColor: 'rgba(167,139,250,0.15)', alignItems: 'center', justifyContent: 'center' },
  adventureDropText: { fontSize: 34 },
  adventureDropTextFilled: { fontSize: 92, lineHeight: 98, fontWeight: '900', color: '#36D399' },
  additionPromptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' },
  promptGroup: { minWidth: 200, alignItems: 'center', justifyContent: 'center' },
  symbolSlot: { width: 70, alignItems: 'center', justifyContent: 'center' },
  plusSign: { fontSize: 64, fontWeight: '800', color: tokens.text, lineHeight: 66 },
  inlineDropZone: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: '#AED5DE', backgroundColor: '#EAF7FC', alignItems: 'center', justifyContent: 'center' },
  inlineDropZoneGhost: { width: TILE_SIZE, height: 1, opacity: 0 },
  appleRows: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  appleRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  ballRows: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  ballRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  ball: { shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  ballBlue: { backgroundColor: '#1A8FE0', shadowColor: '#1A8FE0' },
  ballPink: { backgroundColor: '#E0547D', shadowColor: '#E0547D' },
  ballPurple: { backgroundColor: '#7C3AED', shadowColor: '#7C3AED' },
  objectSprite: { shadowColor: '#0B1C33', shadowOpacity: 0.22, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  objectTile: { borderRadius: 16, padding: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2EEF3', shadowColor: '#7AA8B8', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, alignItems: 'center', justifyContent: 'center' },
  objectEmojiRemoved: { display: 'none' },
  appleIcon3d: { width: 72, height: 72 },
  dropZoneWrap: { width: '100%', alignItems: 'center', marginTop: 8, marginBottom: 24 },
  dropZone: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: '#AED5DE', backgroundColor: tokens.drop, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  snapCard: { width: TILE_SIZE - 12, height: TILE_SIZE - 12, borderRadius: 20, borderWidth: 2, borderColor: '#5C4B39', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  snapCardText: { fontSize: 72, fontWeight: '900', color: '#264A5A' },
  dropText: { fontSize: 20, color: tokens.subtle, fontWeight: '700', textAlign: 'center', paddingHorizontal: 10 },
  repeatInlineBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D8EEF4', borderWidth: 1, borderColor: '#AED5DE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginTop: 4 },
  repeatInlineBtnText: { color: '#12404A', fontWeight: '700' },
  optionRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  imageOptionWrap: { width: 360, minHeight: 236, borderRadius: 24, shadowColor: '#5E442F', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  imageOption: { width: '100%', minHeight: 236, borderRadius: 24, borderWidth: 2, borderColor: '#5C4B39', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, overflow: 'hidden' },
  choiceCardWrap: { minWidth: 132, borderRadius: 22 },
  choiceCard: { backgroundColor: '#243669', borderWidth: 2, borderColor: 'rgba(167,139,250,0.65)', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', gap: 8, minWidth: 132 },
  choiceCardWrong: { borderWidth: 2, borderColor: '#FF7C82' },
  choiceCardCorrect: { borderWidth: 2, borderColor: '#79DB8B' },
  choiceCount: { color: 'rgba(255,255,255,0.8)', fontWeight: '800', fontSize: 14 },
  numberCardWrap: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 24, shadowColor: '#5E442F', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  numberCard: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 24, borderWidth: 2, borderColor: '#5C4B39', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  bagKnot: { position: 'absolute', top: -2, width: 72, height: 22, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: 'rgba(105,74,42,0.65)' },
  numberInnerGlow: { position: 'absolute', top: 20, left: 12, right: 12, height: 26, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.45)' },
  fullCardPress: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 78, fontWeight: '900', color: '#264A5A', textShadowColor: 'rgba(255,255,255,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  feedbackPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EEF7FA', borderWidth: 1, borderColor: '#D2E8EF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, maxWidth: 920 },
  feedback: { fontSize: 20, color: '#2A6656', textAlign: 'center' },
  sparkles: { fontSize: 20, marginLeft: 6 },
  confettiLayer: { position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center', justifyContent: 'center' },
  confettiPiece: { position: 'absolute', fontSize: 34 },
  answerRevealWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -4, marginBottom: 4 },
  answerRevealText: { fontSize: 24, fontWeight: '700', color: tokens.text },
  answerRevealBadge: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#7EC0E7' },
  answerRevealNumber: { fontSize: 40, fontWeight: '900', color: '#154A66' },
});

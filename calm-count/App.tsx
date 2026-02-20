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
type Chapter = 'counting' | 'addition';

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

const TILE_SIZE = 184;
const APPLE_3D = require('./assets/objects/apple3d.png');
const STAR_3D = require('./assets/objects/star3d.png');
const BALL_3D = require('./assets/objects/ball3d.png');
const BLOCK_3D = require('./assets/objects/block3d.png');
const BANANA_3D = require('./assets/objects/banana3d.png');

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
  const [showIntro, setShowIntro] = useState(true);
  const [confettiKey, setConfettiKey] = useState(0);
  const [optionFlash, setOptionFlash] = useState<{ value: number; status: 'wrong' | 'correct' } | null>(null);
  const [dropZoneRect, setDropZoneRect] = useState<Rect | null>(null);

  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardLift = useRef(new Animated.Value(1)).current;
  const screenFade = useRef(new Animated.Value(0)).current;
  const revealScale = useRef(new Animated.Value(0.6)).current;
  const webAudioCtxRef = useRef<any>(null);
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
    if (screen === 'question') {
      setQuestion(buildQuestion(chapter, level));
      setDraggingNumber(null);
      setFirstAttemptMissed(false);
      dragPos.setValue({ x: 0, y: 0 });
      setFeedback('You can do it!');
      setRevealedAnswer(null);
      setOptionFlash(null);
      revealScale.setValue(0.6);
      setTimeout(() => {
        dropZoneRef.current?.measureInWindow((x, y, width, height) => {
          setDropZoneRect({ x, y, width, height });
        });
      }, 40);
    }
  }, [screen, chapter, level, dragPos]);

  const shouldUseDrag = question?.mode === 'counting' || question?.mode === 'addition-drag-number';

  function overlaps(a: Rect, b: Rect) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => dragPos.setValue({ x: g.dx, y: g.dy }),
    onPanResponderRelease: (_, g) => {
      if (!question || draggingNumber == null) return;

      const cardRect: Rect = {
        x: g.moveX - TILE_SIZE / 2,
        y: g.moveY - TILE_SIZE / 2,
        width: TILE_SIZE,
        height: TILE_SIZE,
      };

      const touchingDropZone = !!dropZoneRect && overlaps(cardRect, dropZoneRect);

      if (touchingDropZone && draggingNumber === question.answer) {
        setOptionFlash({ value: draggingNumber, status: 'correct' });
        setTimeout(() => setOptionFlash(null), 700);

        if (dropZoneRect) {
          const dropCenterX = dropZoneRect.x + dropZoneRect.width / 2;
          const dropCenterY = dropZoneRect.y + dropZoneRect.height / 2;
          const snapDx = g.dx + (dropCenterX - g.moveX);
          const snapDy = g.dy + (dropCenterY - g.moveY);

          Animated.spring(dragPos, {
            toValue: { x: snapDx, y: snapDy },
            useNativeDriver: false,
            bounciness: 7,
            speed: 16,
          }).start(() => {
            handleLevelSuccess();
          });
        } else {
          handleLevelSuccess();
        }
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
    if (screen === 'home') return 'Welcome to Calm Count. Tap Start Learning. Hold Parent Zone to open settings.';
    if (screen === 'parent') return 'Parent Zone. Toggle settings and use Test Chime to confirm sound.';
    if (screen === 'chapterIntro') {
      return chapter === 'counting'
        ? 'Counting chapter. Drag the correct number card into the drop zone.'
        : level <= 5
        ? 'Addition chapter. Tap the picture group that matches the answer.'
        : 'Addition chapter. Drag the correct number card into the drop zone.';
    }
    if (screen === 'question' && question) {
      if (question.mode === 'counting') return 'Count the objects and drag the matching number card into the drop zone.';
      if (question.mode === 'addition-image-choice') return 'Add both groups, then tap the correct picture option.';
      return 'Add both groups and drag the correct number card into the drop zone.';
    }
    return 'Let’s keep learning.';
  }

  function repeatInstructions() {
    const line = getInstructionLine();
    let played = false;
    if (screen === 'home') played = playVoiceClip(VOICE_CLIPS.home);
    else if (screen === 'parent') played = playVoiceClip(VOICE_CLIPS.parent);
    else if (screen === 'chapterIntro') {
      played = playVoiceClip(chapter === 'counting' ? VOICE_CLIPS.counting : (level <= 5 ? VOICE_CLIPS.additionImage : VOICE_CLIPS.additionDrag));
    } else if (screen === 'question' && question) {
      if (question.mode === 'counting') played = playVoiceClip(VOICE_CLIPS.counting);
      else if (question.mode === 'addition-image-choice') played = playVoiceClip(VOICE_CLIPS.additionImage);
      else played = playVoiceClip(VOICE_CLIPS.additionDrag);
    }
    if (!played) speakLine(line);
    if (screen === 'question') setFeedback(line);
  }

  function startLearning() {
    setChapter(settings.skipCounting ? 'addition' : 'counting');
    setLevel(1);
    setScreen('chapterIntro');
  }

  function levelKey(ch: Chapter, lv: number) {
    return `${ch === 'counting' ? 'C' : 'A'}${lv}`;
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
        setChapter('addition');
        setLevel(1);
        setScreen('chapterIntro');
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
    const waitMs = question.mode === 'addition-image-choice' ? 3000 : 1050;
    setTimeout(() => advanceAfterSuccess(firstTry), waitMs);
  }

  function handleWrongAttempt() {
    if (!firstAttemptMissed) setFirstAttemptMissed(true);
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

  const objectTheme = getObjectTheme(chapter, level);

  const masteryLabels = getMasteryLabels(stats.levelStats);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <Animated.View style={[styles.screen, isTabletLandscape && styles.screenWide, { opacity: screenFade }]}>
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
        {showIntro && (
          <View style={styles.introOverlay}>
            <Text style={styles.introTitle}>Welcome to Calm Count</Text>
            <Text style={styles.introText}>Tap, drag, and learn with beautiful 3D objects. Parent zone has progress insights.</Text>
            <PrimaryButton title="Let’s Begin" icon="party-popper" onPress={() => setShowIntro(false)} />
          </View>
        )}
        {screen === 'home' && (
          <>
            <Text style={styles.title}>Calm Count</Text>
            <Text style={styles.subtitle}>Beautiful, calm math learning for ages 4–6</Text>
            <PrimaryButton title="Start Learning" icon="play-circle-outline" onPress={startLearning} />
            <Pressable style={styles.parentBtn} onLongPress={() => setScreen('parent')} delayLongPress={600}>
              <MaterialCommunityIcons name="account-cog-outline" size={22} color={tokens.subtle} />
              <Text style={styles.parentText}>Parent Zone (hold)</Text>
            </Pressable>
          </>
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
            <Text style={styles.title}>{chapter === 'counting' ? 'Counting Chapter' : 'Addition Chapter'}</Text>
            <Text style={styles.subtitle}>
              {chapter === 'counting'
                ? 'Drag the right number card into the square.'
                : level <= 5
                ? 'Pick the correct apple group.'
                : 'Now we answer with numbers. You can do it!'}
            </Text>
            <PrimaryButton title={`Start Level ${level}`} icon="rocket-launch-outline" onPress={() => setScreen('question')} />
          </>
        )}

        {screen === 'question' && question && (
          <>
            <View style={styles.topBar}>
              <Text style={styles.levelLabel}>{chapter === 'counting' ? `Counting ${level}/5` : `Addition ${level}/10`}</Text>
              <View style={styles.starPill}><MaterialCommunityIcons name="star" size={18} color="#B58400" /><Text style={styles.starText}>{stars}</Text></View>
            </View>

            <View style={styles.gameBoard}>
              {question.mode !== 'counting' && (
                <View style={styles.equationBoard}>
                  <Text style={styles.equationText}>{question.promptA} + {question.promptB} = ?</Text>
                </View>
              )}

              <View style={styles.promptBox}>
                {question.mode === 'counting' ? (
                  renderObjectRows(question.answer, objectTheme.asset, 5, 150)
                ) : (
                  <View style={styles.additionPromptRow}>
                    {renderObjectRows(question.promptA, objectTheme.asset, 4)}
                    <Text style={styles.plusSign}>+</Text>
                    {renderObjectRows(question.promptB ?? 0, objectTheme.asset, 4)}
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

              {shouldUseDrag && (
                <View
                  ref={(r) => { dropZoneRef.current = r; }}
                  onLayout={() => {
                    dropZoneRef.current?.measureInWindow((x, y, width, height) => {
                      setDropZoneRect({ x, y, width, height });
                    });
                  }}
                  style={styles.dropZone}
                >
                  <MaterialCommunityIcons name="tray-arrow-down" size={32} color={tokens.subtle} />
                </View>
              )}

              {question.mode === 'addition-image-choice' ? (
                <View style={styles.optionRow}>
                  {question.options.map((opt) => (
                    <Pressable key={opt} style={styles.imageOption} onPress={() => handleImageChoice(opt)}>{renderObjectRows(opt, objectTheme.asset, 4)}</Pressable>
                  ))}
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
                        style={[styles.numberCardWrap, draggingNumber === opt ? dragPos.getLayout() : undefined, draggingNumber === opt ? { transform: [{ scale: cardLift }] } : undefined]}
                        {...(draggingNumber === opt ? panResponder.panHandlers : {})}
                      >
                        <Pressable style={styles.fullCardPress} onPressIn={() => { setDraggingNumber(opt); dragPos.setValue({ x: 0, y: 0 }); cardLift.setValue(1.03); }}>
                          <LinearGradient colors={cardColors} start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 1 }} style={styles.numberCard}>
                            <View style={styles.bagKnot} />
                            <View style={styles.numberInnerGlow} />
                            <Text style={styles.numberText}>{opt}</Text>
                          </LinearGradient>
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              )}

              <Pressable style={styles.repeatInlineBtn} onPress={repeatInstructions}>
                <MaterialCommunityIcons name="bullhorn-outline" size={18} color="#12404A" />
                <Text style={styles.repeatInlineBtnText}>Repeat instructions</Text>
              </Pressable>

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

function SettingRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={styles.settingRow}><Text style={styles.settingLabel}>{label}</Text><Switch value={value} onValueChange={onChange} /></View>;
}

function buildQuestion(chapter: Chapter, level: number): RoundQuestion {
  if (chapter === 'counting') {
    const cfg = countingConfigs[Math.max(0, Math.min(4, level - 1))];
    const answer = randInt(cfg.min, cfg.max);
    return { promptA: answer, answer, options: numberOptions(answer, cfg.optionCount, cfg.min, cfg.max), mode: 'counting' };
  }
  if (level <= 5) {
    const max = Math.min(7, level + 2);
    const a = randInt(1, max - 1); const b = randInt(1, max - a); const answer = a + b;
    return { promptA: a, promptB: b, answer, options: numberOptions(answer, Math.min(3, level + 1), 1, 10), mode: 'addition-image-choice' };
  }
  const max = Math.min(10, level);
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

function renderObjectRows(count: number, asset: any, perRow = 5, iconSize = 72) {
  const rows: number[] = [];
  for (let i = 0; i < count; i += perRow) rows.push(Math.min(perRow, count - i));
  return (
    <View style={styles.appleRows}>
      {rows.map((n, idx) => (
        <View key={`${count}-${idx}`} style={styles.appleRow}>
          {Array.from({ length: n }).map((_, j) => (
            <Image key={j} source={asset} style={[styles.appleIcon3d, { width: iconSize, height: iconSize }]} resizeMode="contain" />
          ))}
        </View>
      ))}
    </View>
  );
}


function getObjectTheme(chapter: Chapter, level: number) {
  const themes = [
    { name: 'Apple', asset: APPLE_3D },
    { name: 'Star', asset: STAR_3D },
    { name: 'Ball', asset: BALL_3D },
    { name: 'Block', asset: BLOCK_3D },
    { name: 'Banana', asset: BANANA_3D },
  ];
  const idx = chapter === 'counting' ? (level - 1) % themes.length : (level + 1) % themes.length;
  return themes[idx];
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
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: tokens.accent, borderColor: '#A8D8DA', borderWidth: 1, minWidth: 260, paddingVertical: 16, paddingHorizontal: 22, borderRadius: 20 },
  primaryText: { fontSize: 24, fontWeight: '700', color: '#12404A' },
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
  levelLabel: { fontSize: 23, color: tokens.text, fontWeight: '800' },
  starPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF2C8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  starText: { fontSize: 18, fontWeight: '700', color: '#8C6500' },
  equationBoard: { width: '100%', backgroundColor: '#2C7F5E', borderRadius: 18, borderWidth: 3, borderColor: '#8B6D42', paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  equationText: { fontSize: 40, fontWeight: '900', color: '#E8FFF2', textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },
  promptBox: { backgroundColor: '#BDEEFF', borderRadius: 28, paddingHorizontal: 26, paddingVertical: 18, minHeight: 124, justifyContent: 'center', borderWidth: 1, borderColor: '#99D6EB' },
  additionPromptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  plusSign: { fontSize: 56, fontWeight: '800', color: tokens.text, marginHorizontal: 8 },
  appleRows: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  appleRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  objectTile: { borderRadius: 16, padding: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2EEF3', shadowColor: '#7AA8B8', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  appleIcon3d: { width: 72, height: 72 },
  dropZone: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: '#AED5DE', backgroundColor: tokens.drop, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  dropText: { fontSize: 20, color: tokens.subtle, fontWeight: '700', textAlign: 'center', paddingHorizontal: 10 },
  repeatInlineBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D8EEF4', borderWidth: 1, borderColor: '#AED5DE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginTop: 4 },
  repeatInlineBtnText: { color: '#12404A', fontWeight: '700' },
  optionRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  imageOption: { minWidth: 236, minHeight: 188, borderRadius: 22, backgroundColor: '#FDFEFE', borderWidth: 1, borderColor: tokens.border, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
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

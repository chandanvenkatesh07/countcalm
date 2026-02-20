import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Image,
  Switch,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Screen = 'home' | 'parent' | 'chapterIntro' | 'question' | 'levelComplete';
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

const TILE_SIZE = 184;
const tokens = {
  color: {
    bg: '#F7F5EF',
    card: '#FFFFFF',
    text: '#244556',
    subtle: '#5C7B89',
    accent: '#BFE8E8',
    accentDeep: '#6CB9BC',
    success: '#B5E9B9',
    warning: '#F9D4BC',
    border: '#D9E8ED',
    drop: '#E8F6FA',
  },
  radius: { sm: 14, md: 20, lg: 28 },
  space: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 },
};

const APPLE_3D = require('./assets/objects/apple3d.png');

const countingConfigs = [
  { min: 1, max: 3, optionCount: 2 },
  { min: 1, max: 5, optionCount: 3 },
  { min: 1, max: 7, optionCount: 3 },
  { min: 1, max: 10, optionCount: 3 },
  { min: 1, max: 10, optionCount: 4 },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettings] = useState<Settings>({
    skipCounting: false,
    soundEnabled: true,
    voiceEnabled: true,
    minimalAnimations: false,
  });
  const [chapter, setChapter] = useState<Chapter>('counting');
  const [level, setLevel] = useState(1);
  const [question, setQuestion] = useState<RoundQuestion | null>(null);
  const [feedback, setFeedback] = useState('You can do it!');
  const [stars, setStars] = useState(0);
  const [draggingNumber, setDraggingNumber] = useState<number | null>(null);

  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cardLift = useRef(new Animated.Value(1)).current;
  const screenFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(screenFade, {
      toValue: 1,
      duration: settings.minimalAnimations ? 80 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => screenFade.setValue(0);
  }, [screen]);

  useEffect(() => {
    if (screen === 'question') {
      setQuestion(buildQuestion(chapter, level));
      setDraggingNumber(null);
      dragPos.setValue({ x: 0, y: 0 });
      setFeedback('You can do it!');
    }
  }, [screen, chapter, level]);

  const shouldUseDrag = question?.mode === 'counting' || question?.mode === 'addition-drag-number';

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gesture) => {
          dragPos.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: (_, gesture) => {
          if (!question || draggingNumber == null) return;

          const droppedInZone = gesture.dy < -90;
          if (droppedInZone && draggingNumber === question.answer) {
            setFeedback(
              chapter === 'counting'
                ? `Yes! ${question.answer} apples.`
                : `Yes! ${question.promptA} plus ${question.promptB} is ${question.answer}. Great job!`
            );
            setStars((s) => s + 1);
            Animated.sequence([
              Animated.spring(cardLift, { toValue: 1.08, useNativeDriver: true, bounciness: 8 }),
              Animated.spring(cardLift, { toValue: 1, useNativeDriver: true, bounciness: 6 }),
            ]).start();
            setTimeout(nextStep, 900);
          } else {
            setFeedback('Nice try. Let’s try again.');
            Animated.parallel([
              Animated.spring(dragPos, { toValue: { x: 0, y: 0 }, useNativeDriver: false, bounciness: 14 }),
              Animated.sequence([
                Animated.timing(cardLift, { toValue: 0.96, duration: 90, useNativeDriver: true }),
                Animated.timing(cardLift, { toValue: 1, duration: 120, useNativeDriver: true }),
              ]),
            ]).start();
          }
        },
      }),
    [draggingNumber, question, chapter]
  );

  function startLearning() {
    setChapter(settings.skipCounting ? 'addition' : 'counting');
    setLevel(1);
    setScreen('chapterIntro');
  }

  function nextStep() {
    if (chapter === 'counting') {
      if (level < 5) {
        setLevel((l) => l + 1);
        setScreen('levelComplete');
      } else {
        setChapter('addition');
        setLevel(1);
        setScreen('chapterIntro');
      }
      return;
    }
    if (level < 10) {
      setLevel((l) => l + 1);
      setScreen('levelComplete');
      return;
    }
    setScreen('home');
    setFeedback('Amazing work!');
  }

  function handleImageChoice(choice: number) {
    if (!question) return;
    if (choice === question.answer) {
      setFeedback(`Yes! ${question.answer} apples! Great job!`);
      setStars((s) => s + 1);
      setTimeout(nextStep, 900);
      return;
    }
    setFeedback('Nice try. Let’s count together and try again.');
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <Animated.View style={[styles.screen, { opacity: screenFade }]}> 
        {screen === 'home' && (
          <>
            <Text style={styles.title}>Calm Count</Text>
            <Text style={styles.subtitle}>Beautiful, calm math learning for ages 4–6</Text>
            <PrimaryButton title="Start Learning" icon="play-circle-outline" onPress={startLearning} />
            <Pressable style={styles.parentBtn} onLongPress={() => setScreen('parent')} delayLongPress={600}>
              <MaterialCommunityIcons name="account-cog-outline" size={22} color={tokens.color.subtle} />
              <Text style={styles.parentText}>Parent Zone (hold)</Text>
            </Pressable>
          </>
        )}

        {screen === 'parent' && (
          <>
            <Text style={styles.title}>Parent Zone</Text>
            <SettingRow label="Child knows counting (Skip chapter)" value={settings.skipCounting} onChange={(v) => setSettings((s) => ({ ...s, skipCounting: v }))} />
            <SettingRow label="Sound" value={settings.soundEnabled} onChange={(v) => setSettings((s) => ({ ...s, soundEnabled: v }))} />
            <SettingRow label="Voice prompts" value={settings.voiceEnabled} onChange={(v) => setSettings((s) => ({ ...s, voiceEnabled: v }))} />
            <SettingRow label="Minimal animations" value={settings.minimalAnimations} onChange={(v) => setSettings((s) => ({ ...s, minimalAnimations: v }))} />
            <PrimaryButton title="Save & Home" icon="home-outline" onPress={() => setScreen('home')} />
          </>
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
              <View style={styles.starPill}>
                <MaterialCommunityIcons name="star" size={18} color="#B58400" />
                <Text style={styles.starText}>{stars}</Text>
              </View>
            </View>

            <View style={styles.promptBox}>
              {question.mode === 'counting' ? (
                renderAppleRows(question.answer)
              ) : (
                <View style={styles.additionPromptRow}>
                  {renderAppleRows(question.promptA, 4)}
                  <Text style={styles.plusSign}>+</Text>
                  {renderAppleRows(question.promptB ?? 0, 4)}
                </View>
              )}
            </View>

            {shouldUseDrag && (
              <View style={styles.dropZone}>
                <MaterialCommunityIcons name="tray-arrow-down" size={26} color={tokens.color.subtle} />
                <Text style={styles.dropText}>Drop answer here</Text>
              </View>
            )}

            {question.mode === 'addition-image-choice' ? (
              <View style={styles.optionRow}>
                {question.options.map((opt) => (
                  <Pressable key={opt} style={styles.imageOption} onPress={() => handleImageChoice(opt)}>
                    {renderAppleRows(opt, 4)}
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.optionRow}>
                {question.options.map((opt) => (
                  <Animated.View
                    key={opt}
                    style={[
                      styles.numberCard,
                      draggingNumber === opt ? dragPos.getLayout() : undefined,
                      draggingNumber === opt ? { transform: [{ scale: cardLift }] } : undefined,
                    ]}
                    {...(draggingNumber === opt ? panResponder.panHandlers : {})}
                  >
                    <Pressable
                      style={styles.fullCardPress}
                      onPressIn={() => {
                        setDraggingNumber(opt);
                        dragPos.setValue({ x: 0, y: 0 });
                        cardLift.setValue(1.03);
                      }}
                    >
                      <Text style={styles.numberText}>{opt}</Text>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            )}

            <View style={styles.feedbackPill}>
              <MaterialCommunityIcons name="message-text-outline" size={20} color={tokens.color.subtle} />
              <Text style={styles.feedback}>{feedback}</Text>
            </View>
          </>
        )}

        {screen === 'levelComplete' && (
          <>
            <MaterialCommunityIcons name="check-decagram" size={58} color={tokens.color.accentDeep} />
            <Text style={styles.title}>Great Job!</Text>
            <Text style={styles.subtitle}>{chapter === 'addition' && level === 6 ? 'Now we answer with numbers. You can do it!' : 'Ready for the next level?'}</Text>
            <PrimaryButton title={`Start Level ${level}`} icon="arrow-right-circle-outline" onPress={() => setScreen('question')} />
          </>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

function PrimaryButton({ title, icon, onPress }: { title: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }) {
  return (
    <Pressable style={styles.primaryButton} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={22} color="#12404A" />
      <Text style={styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

function SettingRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function buildQuestion(chapter: Chapter, level: number): RoundQuestion {
  if (chapter === 'counting') {
    const cfg = countingConfigs[Math.max(0, Math.min(4, level - 1))];
    const answer = randInt(cfg.min, cfg.max);
    return { promptA: answer, answer, options: numberOptions(answer, cfg.optionCount, cfg.min, cfg.max), mode: 'counting' };
  }
  if (level <= 5) {
    const max = Math.min(7, level + 2);
    const a = randInt(1, max - 1);
    const b = randInt(1, max - a);
    const answer = a + b;
    return { promptA: a, promptB: b, answer, options: numberOptions(answer, Math.min(3, level + 1), 1, 10), mode: 'addition-image-choice' };
  }
  const max = Math.min(10, level);
  const a = randInt(1, max - 1);
  const b = randInt(1, max - a);
  const answer = a + b;
  return { promptA: a, promptB: b, answer, options: numberOptions(answer, level < 10 ? 3 : 4, 1, 10), mode: 'addition-drag-number' };
}

function numberOptions(answer: number, count: number, min: number, max: number) {
  const set = new Set<number>([answer]);
  while (set.size < count) set.add(randInt(min, max));
  return Array.from(set).sort(() => Math.random() - 0.5);
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function renderAppleRows(count: number, perRow = 5) {
  const rows: number[] = [];
  for (let i = 0; i < count; i += perRow) rows.push(Math.min(perRow, count - i));
  return (
    <View style={styles.appleRows}>
      {rows.map((n, idx) => (
        <View key={`${count}-${idx}`} style={styles.appleRow}>
          {Array.from({ length: n }).map((_, j) => (
            <Image key={j} source={APPLE_3D} style={styles.appleIcon3d} resizeMode="contain" />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.bg },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.space.lg, gap: tokens.space.md },
  title: { fontSize: 46, fontWeight: '800', color: tokens.color.text, textAlign: 'center', letterSpacing: 0.2 },
  subtitle: { fontSize: 21, color: tokens.color.subtle, textAlign: 'center', maxWidth: 760, lineHeight: 30 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: tokens.color.accent,
    borderColor: '#A8D8DA',
    borderWidth: 1,
    minWidth: 260,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: tokens.radius.md,
    shadowColor: '#8FB7BE',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryText: { fontSize: 24, fontWeight: '700', color: '#12404A' },
  parentBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#ECE8DC', borderRadius: 14 },
  parentText: { fontSize: 18, color: tokens.color.subtle },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', maxWidth: 780, alignItems: 'center', backgroundColor: tokens.color.card, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: tokens.color.border },
  settingLabel: { fontSize: 20, color: tokens.color.text, width: '80%' },
  topBar: { width: '100%', maxWidth: 920, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelLabel: { fontSize: 23, color: tokens.color.text, fontWeight: '800' },
  starPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF2C8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  starText: { fontSize: 18, fontWeight: '700', color: '#8C6500' },
  promptBox: { backgroundColor: tokens.color.card, borderRadius: tokens.radius.lg, paddingHorizontal: 26, paddingVertical: 18, minHeight: 124, justifyContent: 'center', borderWidth: 1, borderColor: tokens.color.border },
  additionPromptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  plusSign: { fontSize: 56, fontWeight: '800', color: tokens.color.text, marginHorizontal: 8 },
  appleRows: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  appleRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  appleIcon3d: { width: 66, height: 66 },
  dropZone: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: '#AED5DE', backgroundColor: tokens.color.drop, justifyContent: 'center', alignItems: 'center', gap: 8 },
  dropText: { fontSize: 20, color: tokens.color.subtle, fontWeight: '700', textAlign: 'center', paddingHorizontal: 10 },
  optionRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  imageOption: { minWidth: 236, minHeight: 188, borderRadius: 22, backgroundColor: '#FDFEFE', borderWidth: 1, borderColor: tokens.color.border, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, shadowColor: '#9FC2CC', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  numberCard: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 20, backgroundColor: tokens.color.warning, borderWidth: 1, borderColor: '#E7BFA2', justifyContent: 'center', alignItems: 'center' },
  fullCardPress: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 74, fontWeight: '800', color: tokens.color.text },
  feedbackPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EEF7FA', borderWidth: 1, borderColor: '#D2E8EF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, maxWidth: 920 },
  feedback: { fontSize: 21, color: '#2A6656', textAlign: 'center' },
});

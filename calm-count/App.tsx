import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

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

const TILE_SIZE = 180;

const pastel = {
  bg: '#F7F4EC',
  panel: '#FFFFFF',
  accent: '#98D8D8',
  good: '#A7E3A1',
  warn: '#F4C7A1',
  text: '#2F4F5F',
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
  const [settings, setSettings] = useState<Settings>({
    skipCounting: false,
    soundEnabled: true,
    voiceEnabled: true,
    minimalAnimations: false,
  });

  const [chapter, setChapter] = useState<Chapter>('counting');
  const [level, setLevel] = useState(1);
  const [question, setQuestion] = useState<RoundQuestion | null>(null);
  const [feedback, setFeedback] = useState<string>('');
  const [stars, setStars] = useState(0);

  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [draggingNumber, setDraggingNumber] = useState<number | null>(null);

  const apple = '🍎';

  useEffect(() => {
    if (screen === 'question') {
      setQuestion(buildQuestion(chapter, level));
      setFeedback('');
      setDraggingNumber(null);
      dragPos.setValue({ x: 0, y: 0 });
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
          if (draggingNumber == null || !question) return;

          const droppedInZone = gesture.dy < -80;

          if (droppedInZone && draggingNumber === question.answer) {
            setFeedback(chapter === 'counting' ? `Yes! ${question.answer} apples.` : `Yes! ${question.promptA} plus ${question.promptB} is ${question.answer}. Great job!`);
            setStars((s) => s + 1);
            setTimeout(() => {
              nextStep();
            }, 900);
          } else {
            setFeedback('Nice try. Let’s try again.');
            Animated.spring(dragPos, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
              bounciness: 12,
            }).start();
          }
        },
      }),
    [draggingNumber, question, chapter]
  );

  function startLearning() {
    const initialChapter: Chapter = settings.skipCounting ? 'addition' : 'counting';
    setChapter(initialChapter);
    setLevel(1);
    setScreen('chapterIntro');
  }

  function nextStep() {
    if (chapter === 'counting') {
      if (level < 5) {
        setLevel(level + 1);
        setScreen('levelComplete');
      } else {
        setChapter('addition');
        setLevel(1);
        setScreen('chapterIntro');
      }
      return;
    }

    if (level < 10) {
      setLevel(level + 1);
      setScreen('levelComplete');
    } else {
      setScreen('home');
      setFeedback('Amazing work!');
    }
  }

  function beginQuestions() {
    setScreen('question');
  }

  function handleImageChoice(choice: number) {
    if (!question) return;
    if (choice === question.answer) {
      setFeedback(`Yes! ${question.answer} apples! Great job!`);
      setStars((s) => s + 1);
      setTimeout(() => nextStep(), 900);
    } else {
      setFeedback('Nice try. Let’s count together and try again.');
    }
  }

  const chapterTitle = chapter === 'counting' ? 'Counting Chapter' : 'Addition Chapter';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />

      {screen === 'home' && (
        <View style={styles.screen}>
          <Text style={styles.title}>Calm Count</Text>
          <Text style={styles.subtitle}>A calm math game for ages 4-6</Text>

          <Pressable style={styles.primaryButton} onPress={startLearning}>
            <Text style={styles.primaryText}>Start Learning</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onLongPress={() => setScreen('parent')} delayLongPress={600}>
            <Text style={styles.secondaryText}>Parent Zone (hold)</Text>
          </Pressable>
        </View>
      )}

      {screen === 'parent' && (
        <View style={styles.screen}>
          <Text style={styles.title}>Parent Zone</Text>
          <SettingRow
            label="Child knows counting (Skip counting chapter)"
            value={settings.skipCounting}
            onChange={(v) => setSettings((s) => ({ ...s, skipCounting: v }))}
          />
          <SettingRow
            label="Sound"
            value={settings.soundEnabled}
            onChange={(v) => setSettings((s) => ({ ...s, soundEnabled: v }))}
          />
          <SettingRow
            label="Voice Prompts"
            value={settings.voiceEnabled}
            onChange={(v) => setSettings((s) => ({ ...s, voiceEnabled: v }))}
          />
          <SettingRow
            label="Minimal Animations"
            value={settings.minimalAnimations}
            onChange={(v) => setSettings((s) => ({ ...s, minimalAnimations: v }))}
          />

          <Pressable style={styles.primaryButton} onPress={() => setScreen('home')}>
            <Text style={styles.primaryText}>Save & Go Home</Text>
          </Pressable>
        </View>
      )}

      {screen === 'chapterIntro' && (
        <View style={styles.screen}>
          <Text style={styles.title}>{chapterTitle}</Text>
          <Text style={styles.subtitle}>
            {chapter === 'counting'
              ? 'Drag the correct number into the box.'
              : level <= 5
                ? 'Pick the correct apple group.'
                : 'Now we answer with numbers! Drag and drop.'}
          </Text>
          <Pressable style={styles.primaryButton} onPress={beginQuestions}>
            <Text style={styles.primaryText}>Start Level {level}</Text>
          </Pressable>
        </View>
      )}

      {screen === 'question' && question && (
        <View style={styles.screen}>
          <Text style={styles.levelLabel}>
            {chapter === 'counting' ? `Counting ${level}/5` : `Addition ${level}/10`}
          </Text>

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
                  style={[styles.numberCard, draggingNumber === opt ? dragPos.getLayout() : undefined]}
                  {...(draggingNumber === opt ? panResponder.panHandlers : {})}
                >
                  <Pressable
                    style={styles.fullCardPress}
                    onPressIn={() => {
                      setDraggingNumber(opt);
                      dragPos.setValue({ x: 0, y: 0 });
                    }}
                  >
                    <Text style={styles.numberText}>{opt}</Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          )}

          <Text style={styles.feedback}>{feedback || 'You can do it!'}</Text>
          <Text style={styles.stars}>⭐ {stars}</Text>
        </View>
      )}

      {screen === 'levelComplete' && (
        <View style={styles.screen}>
          <Text style={styles.title}>Great Job!</Text>
          <Text style={styles.subtitle}>Ready for the next level?</Text>
          {chapter === 'addition' && level === 6 && (
            <Text style={styles.transition}>Now we answer with numbers. You can do it!</Text>
          )}
          <Pressable style={styles.primaryButton} onPress={() => setScreen('question')}>
            <Text style={styles.primaryText}>Start Level {level}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function SettingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
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
    return {
      promptA: answer,
      answer,
      options: numberOptions(answer, cfg.optionCount, cfg.min, cfg.max),
      mode: 'counting',
    };
  }

  if (level <= 5) {
    const max = Math.min(7, level + 2);
    const a = randInt(1, max - 1);
    const b = randInt(1, max - a);
    const answer = a + b;
    return {
      promptA: a,
      promptB: b,
      answer,
      options: numberOptions(answer, Math.min(3, level + 1), 1, 10),
      mode: 'addition-image-choice',
    };
  }

  const max = Math.min(10, level);
  const a = randInt(1, max - 1);
  const b = randInt(1, max - a);
  const answer = a + b;
  return {
    promptA: a,
    promptB: b,
    answer,
    options: numberOptions(answer, level < 10 ? 3 : 4, 1, 10),
    mode: 'addition-drag-number',
  };
}

function numberOptions(answer: number, count: number, min: number, max: number) {
  const set = new Set<number>([answer]);
  while (set.size < count) {
    set.add(randInt(min, max));
  }
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
            <Text key={j} style={styles.bigApple}>{'🍎'}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: pastel.bg },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
  title: { fontSize: 44, fontWeight: '700', color: pastel.text, textAlign: 'center' },
  subtitle: { fontSize: 20, color: pastel.text, textAlign: 'center', maxWidth: 700 },
  primaryButton: {
    backgroundColor: pastel.accent,
    paddingHorizontal: 26,
    paddingVertical: 16,
    borderRadius: 18,
    minWidth: 240,
    alignItems: 'center',
  },
  primaryText: { fontSize: 24, fontWeight: '700', color: '#134' },
  secondaryButton: {
    backgroundColor: '#E9E7DF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  secondaryText: { fontSize: 20, color: pastel.text },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 760,
    alignItems: 'center',
    backgroundColor: pastel.panel,
    padding: 16,
    borderRadius: 12,
  },
  settingLabel: { fontSize: 20, color: pastel.text, width: '80%' },
  levelLabel: { fontSize: 22, color: pastel.text, fontWeight: '700' },
  promptBox: {
    backgroundColor: pastel.panel,
    borderRadius: 24,
    paddingHorizontal: 30,
    paddingVertical: 20,
    minHeight: 110,
    justifyContent: 'center',
  },
  promptText: { fontSize: 54, textAlign: 'center' },
  additionPromptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  plusSign: { fontSize: 54, fontWeight: '700', color: pastel.text, marginHorizontal: 8 },
  appleRows: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  appleRow: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'center', gap: 14 },
  bigApple: { fontSize: 54, lineHeight: 62 },
  dropZone: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#AFDAE1',
    backgroundColor: '#DDF0F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropText: { fontSize: 26, color: pastel.text, fontWeight: '600', textAlign: 'center', paddingHorizontal: 12 },
  optionRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageOption: {
    minWidth: 220,
    minHeight: 170,
    borderRadius: 18,
    backgroundColor: '#F6FBFD',
    borderWidth: 2,
    borderColor: '#D7EAEE',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionApple: { fontSize: 42 },
  numberCard: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 24,
    backgroundColor: '#F8D8C9',
    borderWidth: 2,
    borderColor: '#E8B8A5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullCardPress: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 72, fontWeight: '700', color: pastel.text },
  feedback: { fontSize: 22, color: '#2A6656', textAlign: 'center', minHeight: 30 },
  stars: { fontSize: 24, color: '#B58400', fontWeight: '700' },
  transition: { fontSize: 24, color: pastel.text, textAlign: 'center', maxWidth: 700 },
});

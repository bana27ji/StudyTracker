import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, Alert, 
  ActivityIndicator, ScrollView, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, query, orderBy, setDoc, getDocs, writeBatch, serverTimestamp 
} from 'firebase/firestore';

// ==========================================
// 1. FIREBASE CONFIGURATION (PASTE YOURS HERE)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAYglBg9d6tLGAbsVKcCsV0j2jKc1GZJgM",
  authDomain: "studytracker-1c6c0.firebaseapp.com",
  projectId: "studytracker-1c6c0",
  storageBucket: "studytracker-1c6c0.firebasestorage.app",
  messagingSenderId: "218047398777",
  appId: "1:218047398777:web:8ca5a7fbe45facfbdb65a8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 2. CONTEXT & STATE MANAGEMENT
// ==========================================
const AuthContext = createContext();

const COLORS = {
  background: '#121212',
  card: '#1E1E1E',
  accent: '#4CAF50',
  danger: '#F44336',
  text: '#FFFFFF',
  subText: '#AAAAAA',
  border: '#333333'
};

// ==========================================
// 3. UTILITY FUNCTIONS
// ==========================================
const formatDate = (dateObj) => {
  if (!dateObj) return 'Never';
  const d = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getYYYYMMDD = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ==========================================
// 4. SCREENS: AUTHENTICATION
// ==========================================
function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill all fields');
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      Alert.alert('Auth Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Study Tracker</Text>
      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.subText} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={COLORS.subText} value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.primaryButton} onPress={handleAuth} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isLogin ? 'Login' : 'Sign Up'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={{ marginTop: 15 }}>
          <Text style={{ color: COLORS.accent, textAlign: 'center' }}>
            {isLogin ? 'Need an account? Sign Up' : 'Have an account? Login'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==========================================
// 5. SCREENS: HOME DASHBOARD
// ==========================================
function DashboardScreen() {
  const { user } = useContext(AuthContext);
  const [topics, setTopics] = useState([]);
  const [subjectsCount, setSubjectsCount] = useState(0);

  // Fetch all data for analytics
  useEffect(() => {
    const subjectsRef = collection(db, `users/${user.uid}/subjects`);
    const unsubSubjects = onSnapshot(subjectsRef, (subSnap) => {
      setSubjectsCount(subSnap.docs.length);
      let allTopics = [];
      let pending = subSnap.docs.length;
      
      if(pending === 0) setTopics([]);

      subSnap.docs.forEach(subDoc => {
        const topicsRef = collection(db, `users/${user.uid}/subjects/${subDoc.id}/topics`);
        onSnapshot(topicsRef, (topSnap) => {
          const subTopics = topSnap.docs.map(t => ({ id: t.id, subjectId: subDoc.id, ...t.data() }));
          allTopics = [...allTopics.filter(t => t.subjectId !== subDoc.id), ...subTopics];
          setTopics([...allTopics]);
        });
      });
    });
    return () => unsubSubjects();
  }, [user.uid]);

  // Analytics Calculations
  const stats = useMemo(() => {
    let totalRevisions = 0;
    let studiedTodayCount = 0;
    let aiScores = [];
    let studyDates = new Set();
    const todayStr = getYYYYMMDD(new Date());
    
    // Weekly Chart Data prep
    const weekMap = {};
    for (let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      weekMap[getYYYYMMDD(d)] = 0;
    }

    topics.forEach(t => {
      totalRevisions += (t.revisionCount || 0);
      
      // Track dates for streak & weekly
      if (t.revisionHistory) {
        t.revisionHistory.forEach(timestamp => {
          const dateStr = getYYYYMMDD(timestamp);
          studyDates.add(dateStr);
          if (dateStr === todayStr) studiedTodayCount++;
          if (weekMap[dateStr] !== undefined) weekMap[dateStr]++;
        });
      }

      // Track AI Scores
      if (t.aiTestScores) {
        t.aiTestScores.forEach(s => aiScores.push(Number(s.score)));
      }
    });

    // Calculate Streaks
    const sortedDates = Array.from(studyDates).sort((a, b) => new Date(b) - new Date(a));
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    let checkDate = new Date();
    
    // Current streak logic
    let todayFound = sortedDates.includes(todayStr);
    let yesterdayFound = sortedDates.includes(getYYYYMMDD(new Date(Date.now() - 86400000)));
    
    if (todayFound || yesterdayFound) {
      let d = todayFound ? new Date() : new Date(Date.now() - 86400000);
      while (sortedDates.includes(getYYYYMMDD(d))) {
        currentStreak++;
        d.setDate(d.getDate() - 1);
      }
    }

    // Best streak logic
    if (sortedDates.length > 0) {
      tempStreak = 1; bestStreak = 1;
      for (let i = 0; i < sortedDates.length - 1; i++) {
        const currD = new Date(sortedDates[i]);
        const nextD = new Date(sortedDates[i+1]);
        const diffDays = (currD - nextD) / (1000 * 3600 * 24);
        if (diffDays === 1) {
          tempStreak++;
          if (tempStreak > bestStreak) bestStreak = tempStreak;
        } else {
          tempStreak = 1;
        }
      }
    }

    // AI Stats
    const maxScore = aiScores.length ? Math.max(...aiScores) : 0;
    const avgScore = aiScores.length ? (aiScores.reduce((a,b)=>a+b,0) / aiScores.length).toFixed(1) : 0;

    // Weekly Chart values
    const chartData = Object.keys(weekMap).map(k => ({
      label: new Date(k).toLocaleDateString('en-GB', {weekday: 'short'}),
      value: weekMap[k]
    }));
    const totalWeekly = chartData.reduce((sum, item) => sum + item.value, 0);

    return { totalRevisions, studiedTodayCount, currentStreak, bestStreak, maxScore, avgScore, chartData, totalWeekly };
  }, [topics]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={styles.headerTitle}>Dashboard</Text>

      {/* Streak Section */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
        <View style={[styles.card, { flex: 1, marginRight: 5, alignItems: 'center' }]}>
          <Text style={{ fontSize: 30 }}>🔥</Text>
          <Text style={styles.statNumber}>{stats.currentStreak}</Text>
          <Text style={styles.subText}>Current Streak</Text>
        </View>
        <View style={[styles.card, { flex: 1, marginLeft: 5, alignItems: 'center' }]}>
          <Text style={{ fontSize: 30 }}>🏆</Text>
          <Text style={styles.statNumber}>{stats.bestStreak}</Text>
          <Text style={styles.subText}>Best Streak</Text>
        </View>
      </View>

      {/* Summary Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Overview</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.text}>Subjects Active</Text>
          <Text style={styles.statSmall}>{subjectsCount}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.text}>Total Topics</Text>
          <Text style={styles.statSmall}>{topics.length}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.text}>Topics Studied Today</Text>
          <Text style={[styles.statSmall, { color: COLORS.accent }]}>{stats.studiedTodayCount}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.text}>Total Lifetime Revisions</Text>
          <Text style={styles.statSmall}>{stats.totalRevisions}</Text>
        </View>
      </View>

      {/* AI Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI Test Performance</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.text}>Average Score</Text>
          <Text style={styles.statSmall}>{stats.avgScore}%</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.text}>Highest Score</Text>
          <Text style={[styles.statSmall, { color: COLORS.accent }]}>{stats.maxScore}%</Text>
        </View>
      </View>

      {/* Weekly Progress Graph */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Weekly Progress ({stats.totalWeekly} Revisions)</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 150, marginTop: 10 }}>
          {stats.chartData.map((data, idx) => {
            const maxVal = Math.max(...stats.chartData.map(d => d.value), 1);
            const height = (data.value / maxVal) * 100;
            return (
              <View key={idx} style={{ alignItems: 'center', width: '12%' }}>
                <Text style={[styles.subText, { marginBottom: 5 }]}>{data.value > 0 ? data.value : ''}</Text>
                <View style={{ width: '100%', height: `${height}%`, minHeight: 5, backgroundColor: COLORS.accent, borderRadius: 4 }} />
                <Text style={[styles.subText, { fontSize: 10, marginTop: 5 }]}>{data.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

// ==========================================
// 6. SCREENS: SUBJECTS MANAGEMENT
// ==========================================
function SubjectListScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    const q = query(collection(db, `users/${user.uid}/subjects`), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setSubjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const saveSubject = async () => {
    if (!subjectName.trim()) return;
    try {
      if (editId) {
        await updateDoc(doc(db, `users/${user.uid}/subjects/${editId}`), { name: subjectName });
      } else {
        await addDoc(collection(db, `users/${user.uid}/subjects`), { name: subjectName, createdAt: serverTimestamp() });
      }
      setModalVisible(false); setSubjectName(''); setEditId(null);
    } catch (err) { Alert.alert('Error', err.message); }
  };

  const deleteSubject = (id) => {
    Alert.alert('Delete', 'Are you sure? All topics inside will be orphaned.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => await deleteDoc(doc(db, `users/${user.uid}/subjects/${id}`)) }
    ]);
  };

  const filteredSubjects = subjects.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.container}>
      <TextInput style={[styles.input, { margin: 15 }]} placeholder="Search Subjects..." placeholderTextColor={COLORS.subText} value={search} onChangeText={setSearch} />
      
      <FlatList
        data={filteredSubjects}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Topics', { subjectId: item.id, subjectName: item.name })}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={() => { setEditId(item.id); setSubjectName(item.name); setModalVisible(true); }} style={{ padding: 10 }}>
                  <Ionicons name="pencil" size={20} color={COLORS.subText} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteSubject(item.id)} style={{ padding: 10 }}>
                  <Ionicons name="trash" size={20} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => { setEditId(null); setSubjectName(''); setModalVisible(true); }}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.headerTitle}>{editId ? 'Edit Subject' : 'Add Subject'}</Text>
            <TextInput style={styles.input} placeholder="Subject Name" placeholderTextColor={COLORS.subText} value={subjectName} onChangeText={setSubjectName} autoFocus />
            <View style={styles.rowBetween}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setModalVisible(false)}><Text style={styles.buttonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, { width: '45%', marginTop: 0 }]} onPress={saveSubject}><Text style={styles.buttonText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==========================================
// 7. SCREENS: TOPIC LIST
// ==========================================
function TopicListScreen({ route, navigation }) {
  const { subjectId, subjectName } = route.params;
  const { user } = useContext(AuthContext);
  const [topics, setTopics] = useState([]);
  const [search, setSearch] = useState('');
  const [sortType, setSortType] = useState('Last Studied'); // Last Studied, Revisions, A-Z
  
  const [modalVisible, setModalVisible] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    navigation.setOptions({ title: subjectName });
    const q = query(collection(db, `users/${user.uid}/subjects/${subjectId}/topics`));
    const unsub = onSnapshot(q, (snap) => {
      setTopics(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [subjectId]);

  const saveTopic = async () => {
    if (!topicTitle.trim()) return;
    try {
      if (editId) {
        await updateDoc(doc(db, `users/${user.uid}/subjects/${subjectId}/topics/${editId}`), { title: topicTitle });
      } else {
        await addDoc(collection(db, `users/${user.uid}/subjects/${subjectId}/topics`), { 
          title: topicTitle, revisionCount: 0, lastStudied: null, revisionHistory: [], aiTestScores: [], createdAt: Date.now() 
        });
      }
      setModalVisible(false); setTopicTitle(''); setEditId(null);
    } catch (err) { Alert.alert('Error', err.message); }
  };

  const markReadToday = async (topic) => {
    const today = new Date().toISOString();
    const history = topic.revisionHistory || [];
    try {
      await updateDoc(doc(db, `users/${user.uid}/subjects/${subjectId}/topics/${topic.id}`), {
        lastStudied: today,
        revisionCount: (topic.revisionCount || 0) + 1,
        revisionHistory: [...history, today]
      });
    } catch (err) { Alert.alert('Error', err.message); }
  };

  const deleteTopic = (id) => {
    Alert.alert('Delete', 'Delete this topic?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => await deleteDoc(doc(db, `users/${user.uid}/subjects/${subjectId}/topics/${id}`)) }
    ]);
  };

  let filtered = topics.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));
  if (sortType === 'A-Z') filtered.sort((a,b) => a.title.localeCompare(b.title));
  if (sortType === 'Revisions') filtered.sort((a,b) => (b.revisionCount||0) - (a.revisionCount||0));
  if (sortType === 'Last Studied') filtered.sort((a,b) => new Date(b.lastStudied || 0) - new Date(a.lastStudied || 0));

  return (
    <View style={styles.container}>
      <View style={{ padding: 15 }}>
        <TextInput style={styles.input} placeholder="Search Topics..." placeholderTextColor={COLORS.subText} value={search} onChangeText={setSearch} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 }}>
          {['Last Studied', 'Revisions', 'A-Z'].map(type => (
            <TouchableOpacity key={type} onPress={() => setSortType(type)}>
              <Text style={{ color: sortType === type ? COLORS.accent : COLORS.subText, fontWeight: sortType === type ? 'bold' : 'normal' }}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={{flex: 1}} onPress={() => navigation.navigate('TopicDetail', { subjectId, topicId: item.id, title: item.title })}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={styles.badge}><Text style={{fontSize:12, color:'#fff'}}>{item.revisionCount || 0} Revs</Text></View>
              </View>
              <Text style={styles.subText}>Last Studied: {formatDate(item.lastStudied)}</Text>
            </TouchableOpacity>
            
            <View style={[styles.rowBetween, { marginTop: 15, borderTopWidth: 1, borderColor: COLORS.border, paddingTop: 10 }]}>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={() => { setEditId(item.id); setTopicTitle(item.title); setModalVisible(true); }} style={{ marginRight: 15 }}>
                  <Ionicons name="pencil" size={20} color={COLORS.subText} />
                                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteTopic(item.id)}>
                  <Ionicons name="trash" size={20} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity style={styles.actionButton} onPress={() => markReadToday(item)}>
                <Ionicons name="checkmark-done" size={18} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 5, fontWeight: 'bold' }}>Read Today</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => { setEditId(null); setTopicTitle(''); setModalVisible(true); }}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.headerTitle}>{editId ? 'Edit Topic' : 'Add Topic'}</Text>
            <TextInput style={styles.input} placeholder="Topic Title" placeholderTextColor={COLORS.subText} value={topicTitle} onChangeText={setTopicTitle} autoFocus />
            <View style={styles.rowBetween}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setModalVisible(false)}><Text style={styles.buttonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, { width: '45%', marginTop: 0 }]} onPress={saveTopic}><Text style={styles.buttonText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==========================================
// 8. SCREENS: TOPIC DETAIL (History & AI Scores)
// ==========================================
function TopicDetailScreen({ route }) {
  const { subjectId, topicId, title } = route.params;
  const { user } = useContext(AuthContext);
  const [topic, setTopic] = useState(null);
  
  const [scoreModal, setScoreModal] = useState(false);
  const [scoreInput, setScoreInput] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, `users/${user.uid}/subjects/${subjectId}/topics/${topicId}`), (snap) => {
      if (snap.exists()) setTopic(snap.data());
    });
    return () => unsub();
  }, []);

  const addScore = async () => {
    if (!scoreInput || isNaN(scoreInput)) return;
    const newScore = { id: Date.now().toString(), score: Number(scoreInput), date: new Date().toISOString() };
    const currentScores = topic.aiTestScores || [];
    try {
      await updateDoc(doc(db, `users/${user.uid}/subjects/${subjectId}/topics/${topicId}`), {
        aiTestScores: [newScore, ...currentScores]
      });
      setScoreModal(false); setScoreInput('');
    } catch (err) { Alert.alert('Error', err.message); }
  };

  const deleteScore = async (scoreId) => {
    const updatedScores = topic.aiTestScores.filter(s => s.id !== scoreId);
    try {
      await updateDoc(doc(db, `users/${user.uid}/subjects/${subjectId}/topics/${topicId}`), { aiTestScores: updatedScores });
    } catch (err) { Alert.alert('Error', err.message); }
  };

  if (!topic) return <View style={styles.container}><ActivityIndicator color={COLORS.accent} style={{marginTop: 50}} /></View>;

  const history = [...(topic.revisionHistory || [])].reverse(); // Newest first
  const scores = topic.aiTestScores || [];
  const maxScore = scores.length ? Math.max(...scores.map(s => s.score)) : 0;
  const avgScore = scores.length ? (scores.reduce((a,b)=>a+b.score,0)/scores.length).toFixed(1) : 0;
  const latestScore = scores.length ? scores[0].score : 'N/A';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.subText}>Total Revisions: {topic.revisionCount || 0}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>AI Test Scores</Text>
          <TouchableOpacity onPress={() => setScoreModal(true)}>
            <Ionicons name="add-circle" size={28} color={COLORS.accent} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, marginTop: 10 }}>
          <View><Text style={styles.subText}>Latest</Text><Text style={styles.text}>{latestScore}</Text></View>
          <View><Text style={styles.subText}>Average</Text><Text style={styles.text}>{avgScore}</Text></View>
          <View><Text style={styles.subText}>Highest</Text><Text style={[styles.text, {color: COLORS.accent}]}>{maxScore}</Text></View>
        </View>
        
        {scores.map(s => (
          <View key={s.id} style={[styles.rowBetween, { paddingVertical: 8, borderTopWidth: 1, borderColor: COLORS.border }]}>
            <Text style={styles.text}>{s.score} Marks</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.subText, {marginRight: 15}]}>{formatDate(s.date)}</Text>
              <TouchableOpacity onPress={() => deleteScore(s.id)}><Ionicons name="close-circle" size={20} color={COLORS.danger}/></TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Revision History</Text>
        {history.length === 0 ? <Text style={styles.subText}>Not studied yet.</Text> : 
          history.map((date, idx) => (
            <View key={idx} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.accent} style={{marginRight: 10}} />
              <Text style={styles.text}>{formatDate(date)}</Text>
            </View>
          ))
        }
      </View>

      <Modal visible={scoreModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.headerTitle}>Add AI Score</Text>
            <TextInput style={styles.input} placeholder="Score (e.g. 95)" placeholderTextColor={COLORS.subText} value={scoreInput} onChangeText={setScoreInput} keyboardType="numeric" />
            <View style={styles.rowBetween}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setScoreModal(false)}><Text style={styles.buttonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, { width: '45%', marginTop: 0 }]} onPress={addScore}><Text style={styles.buttonText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// ==========================================
// 9. SCREENS: SETTINGS (Backup / Restore)
// ==========================================
function SettingsScreen() {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);

  const exportData = async () => {
    setLoading(true);
    try {
      const backupData = { subjects: [] };
      const subSnap = await getDocs(collection(db, `users/${user.uid}/subjects`));
      
      for (const subDoc of subSnap.docs) {
        const subject = { id: subDoc.id, ...subDoc.data(), topics: [] };
        const topSnap = await getDocs(collection(db, `users/${user.uid}/subjects/${subDoc.id}/topics`));
        topSnap.docs.forEach(topDoc => {
          subject.topics.push({ id: topDoc.id, ...topDoc.data() });
        });
        backupData.subjects.push(subject);
      }

      const jsonStr = JSON.stringify(backupData);
      const fileUri = FileSystem.documentDirectory + 'StudyTracker_Backup.json';
      await FileSystem.writeAsStringAsync(fileUri, jsonStr, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri);
      Alert.alert('Success', 'Backup ready to save or share!');
    } catch (error) {
      Alert.alert('Backup Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const importData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled) return;
      
      setLoading(true);
      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsedData = JSON.parse(fileContent);

      if (!parsedData.subjects) throw new Error("Invalid backup file format");

      const batch = writeBatch(db);
      parsedData.subjects.forEach(subject => {
        const subRef = doc(db, `users/${user.uid}/subjects`, subject.id);
        batch.set(subRef, { name: subject.name, createdAt: subject.createdAt || Date.now() });
        
        subject.topics.forEach(topic => {
          const topRef = doc(db, `users/${user.uid}/subjects/${subject.id}/topics`, topic.id);
          const { id, ...topicData } = topic;
          batch.set(topRef, topicData);
        });
      });

      await batch.commit();
      Alert.alert('Success', 'Data restored successfully!');
    } catch (error) {
      Alert.alert('Restore Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Settings</Text>
      <View style={styles.card}>
        <Text style={styles.text}>Account: {user.email}</Text>
        <TouchableOpacity style={[styles.secondaryButton, { marginTop: 20 }]} onPress={() => signOut(auth)}>
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.headerTitle, { marginTop: 20 }]}>Data Management</Text>
      <View style={styles.card}>
        <Text style={[styles.subText, {marginBottom: 15}]}>Create an offline backup or restore previous data. Restoring will overwrite matching IDs.</Text>
        
        <TouchableOpacity style={styles.primaryButton} onPress={exportData} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Export Data (Backup)</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.secondaryButton, { marginTop: 15 }]} onPress={importData} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Import Data (Restore)</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==========================================
// 10. NAVIGATION SETUP
// ==========================================
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function SubjectsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.background }, headerTintColor: COLORS.text }}>
      <Stack.Screen name="SubjectList" component={SubjectListScreen} options={{ title: 'My Subjects' }} />
      <Stack.Screen name="Topics" component={TopicListScreen} />
      <Stack.Screen name="TopicDetail" component={TopicDetailScreen} options={{ title: 'Details' }} />
    </Stack.Navigator>
  );
}

function MainApp() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      tabBarIcon: ({ color, size }) => {
        let iconName = route.name === 'Home' ? 'home' : route.name === 'Subjects' ? 'book' : 'settings';
        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: COLORS.accent,
      tabBarInactiveTintColor: COLORS.subText,
      tabBarStyle: { backgroundColor: COLORS.card, borderTopColor: COLORS.border },
      headerShown: false
    })}>
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Subjects" component={SubjectsStack} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ==========================================
// 11. MAIN ENTRY APP COMPONENT
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color={COLORS.accent} /></View>;
  }

  return (
    <AuthContext.Provider value={{ user }}>
      <NavigationContainer theme={{ colors: { background: COLORS.background } }}>
        {user ? <MainApp /> : (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

// ==========================================
// 12. GLOBAL STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 15 },
  title: { fontSize: 32, fontWeight: 'bold', color: COLORS.accent, textAlign: 'center', marginVertical: 40 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, marginBottom: 15 },
  card: { backgroundColor: COLORS.card, borderRadius: 12, padding: 15, marginBottom: 15 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 5 },
  text: { color: COLORS.text, fontSize: 16 },
  subText: { color: COLORS.subText, fontSize: 14 },
  input: { backgroundColor: '#2C2C2C', color: COLORS.text, padding: 15, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  primaryButton: { backgroundColor: COLORS.accent, padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.accent, padding: 15, borderRadius: 8, alignItems: 'center', width: '45%' },
  actionButton: { backgroundColor: COLORS.accent, paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  badge: { backgroundColor: '#333', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statNumber: { fontSize: 28, fontWeight: 'bold', color: COLORS.text, marginVertical: 5 },
  statSmall: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: COLORS.accent, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: COLORS.card, padding: 20, borderRadius: 12 }
});

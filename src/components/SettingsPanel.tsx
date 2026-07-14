import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Switch, TextInput, StyleSheet, Platform, StatusBar } from 'react-native';
import { X, Folder, Cookie, Moon, Sun } from 'lucide-react-native';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  appSettings: any;
  setAppSettings: React.Dispatch<React.SetStateAction<any>>;
  onPickDirectory: () => void;
  onPickCookies: () => void;
}

export default function SettingsPanel({ 
  visible, onClose, appSettings, setAppSettings, onPickDirectory, onPickCookies 
}: SettingsPanelProps) {
  
  // URL formatındaki (%2F vb.) karmaşık yolu insanların okuyabileceği hale getiriyoruz
  const displayPath = appSettings.downloadPath ? decodeURIComponent(appSettings.downloadPath).replace('content://com.android.externalstorage.documents/tree/primary:', 'Dahili Depolama/') : '';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.settingsOverlay}>
        <TouchableOpacity style={styles.settingsCloseTouch} onPress={onClose} />
        
        <View style={styles.settingsPanel}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>Ayarlar</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color="#fff" /></TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            
            <Text style={styles.sectionLabel}>İNDİRME KONUMU</Text>
            <TouchableOpacity style={styles.settingsActionRow} onPress={onPickDirectory}>
              <Folder size={16} color="#06b6d4" />
              <Text style={styles.settingsRowText} numberOfLines={1}>
                {appSettings.downloadPath ? 'Konum Ayarlandı' : 'Klasör Seçiniz (Zorunlu)'}
              </Text>
            </TouchableOpacity>
            
            {/* GÖRÜNÜM DÜZELTMESİ: ellipsizeMode="head" sayesinde yol sağa dayalı ve başı 3 noktalı görünür */}
            {appSettings.downloadPath ? (
              <Text style={styles.pathSubText} numberOfLines={2} ellipsizeMode="head">
                ...{displayPath}
              </Text>
            ) : null}

            <View style={styles.settingsSwitchRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.settingsSwitchTitle}>Akıllı Klasörleme</Text>
                <Text style={styles.settingsSwitchSub}>Dosyaları türlerine göre alt klasörlere ayırır.</Text>
              </View>
              <Switch 
                value={appSettings.smartFolder} 
                onValueChange={(val) => setAppSettings((p: any) => ({ ...p, smartFolder: val }))}
                trackColor={{ false: '#374151', true: '#0891b2' }} thumbColor="#fff"
              />
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>MAKSİMUM EŞZAMANLI İNDİRME</Text>
            <View style={styles.numberButtonGroup}>
              {[1, 2, 3, 4, 5].map(num => (
                <TouchableOpacity 
                  key={num} 
                  style={[styles.numberBtn, appSettings.maxConcurrentDownloads === num && styles.numberBtnActive]}
                  onPress={() => setAppSettings((p: any) => ({ ...p, maxConcurrentDownloads: num }))}
                >
                  <Text style={[styles.numberBtnText, appSettings.maxConcurrentDownloads === num && { color: '#fff' }]}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>ALTYAZI TERCİH SIRASI</Text>
            <View style={styles.subLangInputGroup}>
              <View style={styles.subLangCol}>
                <Text style={styles.subLangLabel}>1. Dil</Text>
                <TextInput style={styles.subLangInput} value={appSettings.subLang1} onChangeText={(t)=>setAppSettings((p: any)=>({...p, subLang1: t}))} maxLength={3} autoCapitalize="characters" />
              </View>
              <View style={styles.subLangCol}>
                <Text style={styles.subLangLabel}>2. Dil</Text>
                <TextInput style={styles.subLangInput} value={appSettings.subLang2} onChangeText={(t)=>setAppSettings((p: any)=>({...p, subLang2: t}))} maxLength={3} autoCapitalize="characters" />
              </View>
              <View style={styles.subLangCol}>
                <Text style={styles.subLangLabel}>3. Dil</Text>
                <TextInput style={styles.subLangInput} value={appSettings.subLang3} onChangeText={(t)=>setAppSettings((p: any)=>({...p, subLang3: t}))} maxLength={3} autoCapitalize="characters" />
              </View>
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>ABONELİK VE KİMLİK DOĞRULAMA</Text>
            <TouchableOpacity style={styles.settingsActionRow} onPress={onPickCookies}>
              <Cookie size={16} color="#9ca3af" />
              <Text style={styles.settingsRowText} numberOfLines={1}>
                {appSettings.cookiesPath ? 'cookies.txt Eklendi' : 'cookies.txt Seçiniz (Opsiyonel)'}
              </Text>
            </TouchableOpacity>

            <View style={[styles.settingsSwitchRow, { marginTop: 16 }]}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {appSettings.isDarkTheme ? <Moon size={16} color="#06b6d4" /> : <Sun size={16} color="#f59e0b" />}
                <Text style={styles.settingsSwitchTitle}>{appSettings.isDarkTheme ? 'Karanlık Tema Aktif' : 'Aydınlık Tema'}</Text>
              </View>
              <Switch 
                value={appSettings.isDarkTheme} 
                onValueChange={(val) => setAppSettings((p: any) => ({ ...p, isDarkTheme: val }))}
                trackColor={{ false: '#374151', true: '#0891b2' }} thumbColor="#fff"
              />
            </View>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  settingsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row' },
  settingsCloseTouch: { width: '25%', height: '100%' },
  settingsPanel: { width: '75%', height: '100%', backgroundColor: '#141414', padding: 16, borderLeftWidth: 1, borderColor: '#222', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 20 },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderColor: '#222', paddingBottom: 10 },
  settingsTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  sectionLabel: { fontSize: 10, fontWeight: 'bold', color: '#6b7280', marginBottom: 10, letterSpacing: 0.5 },
  settingsActionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#374151', padding: 10, borderRadius: 8, gap: 8 },
  settingsRowText: { color: '#d1d5db', fontSize: 12, flex: 1 },
  pathSubText: { fontSize: 11, color: '#9ca3af', marginTop: 6, paddingHorizontal: 4, lineHeight: 16 },
  settingsSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#222', padding: 10, borderRadius: 8, marginTop: 12 },
  settingsSwitchTitle: { fontSize: 12, fontWeight: 'bold', color: '#fff' },
  settingsSwitchSub: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  numberButtonGroup: { flexDirection: 'row', backgroundColor: '#1a1a1a', padding: 4, borderRadius: 8, borderWidth: 1, borderColor: '#222', justifyContent: 'space-between' },
  numberBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  numberBtnActive: { backgroundColor: '#0891b2' },
  numberBtnText: { color: '#6b7280', fontSize: 12, fontWeight: 'bold' },
  subLangInputGroup: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  subLangCol: { flex: 1, alignItems: 'center' },
  subLangLabel: { fontSize: 10, color: '#6b7280', marginBottom: 4, fontWeight: 'bold' },
  subLangInput: { width: '100%', height: 32, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#374151', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 'bold', textAlign: 'center', padding: 0 }
});

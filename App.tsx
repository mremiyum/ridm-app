import React, { useState, useEffect, useMemo } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, 
  SafeAreaView, StatusBar, Modal, Platform, Image, Switch, BackHandler, NativeEventEmitter, NativeModules, Alert,
  useWindowDimensions, Linking
} from 'react-native';
import { 
  Link2, Trash2, Settings, HelpCircle, Power, Play, Pause, 
  File, CheckCircle2, ListFilter, ExternalLink, Share2, FolderOutput,
  ChevronDown, X, Folder, Cookie, Moon, Sun, Globe, Coffee, Mail, Wallet, Copy
} from 'lucide-react-native';

import * as DocumentPicker from 'expo-document-picker'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard'; 

import { fetchFileMetadata } from './src/core/Downloader';
import { startFileDownload, pauseDownload, resumeDownload } from './src/core/DownloadManager';
import { analyzeLink, AnalysisResult, MediaFormat, SubtitleOption } from './src/utils/LinkAnalyzer';
import { requestStoragePermission } from './src/core/FileExporter';
import { DICTIONARY } from './src/locales/dictionary';

const { YtDlpBridge } = NativeModules;
const MAX_LINKS = 10;
const STORAGE_KEY = "@ridm_items_v1";
const SETTINGS_KEY = "@ridm_settings_v1";

type Stage = 'analyzing' | 'analyzed' | 'queued' | 'downloading' | 'paused' | 'finished' | 'error';
type Type = 'single_file' | 'single_media' | 'channel' | 'playlist' | 'unknown' | 'skipped';
type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'size_desc';

interface Item { id: string; url: string; type: Type; title: string; stage: Stage; statusMsg?: string; thumbnail?: string; size?: string; rawSize?: number; progress: number; speed: string; downloaded: string; children: any[]; resumeData?: string; errorMsg?: string; time?: string; timestamp?: number; isExpanded?: boolean; availableFormats?: MediaFormat[]; availableSubtitles?: SubtitleOption[]; availableTabs?: string[]; contentCount?: number; selectedFormatId?: string; selectedSubId?: string; selectedTab?: string; rangeMode?: 'all' | 'custom'; rangeInput?: string; fileUri?: string; progression?: string; }

interface AppSettings {
  downloadPath: string;
  smartFolder: boolean;
  maxConcurrentDownloads: number;
  subLang1: string;
  subLang2: string;
  subLang3: string;
  cookiesPath: string;
  isDarkTheme: boolean;
  language: 'TR' | 'EN' | 'AR' | 'ZH' | 'HI' | 'ES' | 'FR' | 'BN' | 'RU';
}

const LANGUAGES = [
  { id: 'TR', label: 'Türkçe (TR)' }, { id: 'EN', label: 'İngilizce (EN)' }, { id: 'AR', label: 'Arapça (AR)' },
  { id: 'ZH', label: 'Çince (ZH)' }, { id: 'HI', label: 'Hintçe (HI)' }, { id: 'ES', label: 'İspanyolca (ES)' },
  { id: 'FR', label: 'Fransızca (FR)' }, { id: 'BN', label: 'Bengalce (BN)' }, { id: 'RU', label: 'Rusça (RU)' },
  { id: 'DE', label: 'Almanca (DE)' }, { id: 'BOŞ', label: 'Boş Bırak' }
];

const darkTheme = { bgMain: '#0a0a0a', bgCard: '#161616', bgInput: '#1a1a1a', textMain: '#e5e7eb', textSub: '#9ca3af', borderMain: '#1f2937', borderLight: '#374151', primary: '#06b6d4', danger: '#ef4444', success: '#22c55e', modalOverlay: 'rgba(0,0,0,0.85)', iconBtnBg: '#161616' };
const lightTheme = { bgMain: '#e5e7eb', bgCard: '#ffffff', bgInput: '#f9fafb', textMain: '#111827', textSub: '#6b7280', borderMain: '#d1d5db', borderLight: '#e5e7eb', primary: '#0891b2', danger: '#ef4444', success: '#22c55e', modalOverlay: 'rgba(0,0,0,0.85)', iconBtnBg: '#ffffff' };

export default function App() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [linksText, setLinksText] = useState('');
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'FINISHED' | 'LOGS'>('ACTIVE');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isGracefulExit, setIsGracefulExit] = useState(false);
  
  const [isDonateModalOpen, setIsDonateModalOpen] = useState(false);
  
  const [selectModal, setSelectModal] = useState<{ visible: boolean; itemId: string; field: 'format' | 'subtitle' | 'tab' | 'subLang1' | 'subLang2' | 'subLang3' | 'appLang'; title: string; options: { id: string, label: string }[]; }>({ visible: false, itemId: '', field: 'format', title: '', options: [] });
  const [items, setItems] = useState<Item[]>([]);
  const [sessionLinks, setSessionLinks] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<SortOption>('date_desc');
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  // Varsayılan Dil
  const [appSettingsState, setAppSettingsState] = useState<AppSettings>({
    downloadPath: '', smartFolder: false, maxConcurrentDownloads: 1, subLang1: 'TR', subLang2: 'EN', subLang3: 'AR', cookiesPath: '', isDarkTheme: true, 
    language: 'EN'
  });
  // Varsayılan Dil
  const t = (key: keyof typeof DICTIONARY.TR) => {
    return DICTIONARY[appSettingsState.language]?.[key] || DICTIONARY.EN[key] || key;
  };

  useEffect(() => {
    const initializeApp = async () => {
       try {
          const storedItems = await AsyncStorage.getItem(STORAGE_KEY);
          // let hasIncomplete = false; (Artık parametreye ihtiyacımız olmadığı için yoruma alındı)
          if (storedItems) {
              let parsedItems: Item[] = JSON.parse(storedItems);
              // hasIncomplete = parsedItems.some(i => i.stage === 'downloading' || i.stage === 'paused');
              
              parsedItems = parsedItems.map(item => {
                  if (item.stage === 'downloading') return { ...item, stage: 'paused' };
                  return item;
              });
              setItems(parsedItems);
              const urls = new Set(parsedItems.map(i => i.url));
              setSessionLinks(urls);
          }
          setIsInitialLoadDone(true);

          // 1. DÜZELTME: MOTORU ARGÜMANSIZ UYANDIRIYORUZ (Expected 0 arguments hatası engellendi)
          if (YtDlpBridge && YtDlpBridge.init) await YtDlpBridge.init(); 

          let savedSettings = {};
          
          // Çift Dikiş Ayar Yükleme (AsyncStorage Öncelikli)
          const localSettingsStr = await AsyncStorage.getItem(SETTINGS_KEY);
          if (localSettingsStr) {
              savedSettings = JSON.parse(localSettingsStr);
          } else if (YtDlpBridge && YtDlpBridge.loadSettings) {
             const res = await YtDlpBridge.loadSettings();
             if (res && res !== '{}') savedSettings = JSON.parse(res);
          }
          // Varsayılan Dil
          const merged: AppSettings = {
              downloadPath: '', smartFolder: false, maxConcurrentDownloads: 1, 
              subLang1: 'TR', subLang2: 'EN', subLang3: 'AR', cookiesPath: '', isDarkTheme: true,
              language: 'EN',
              ...savedSettings
          };

          if (Object.keys(savedSettings).length === 0) {
              if (YtDlpBridge && YtDlpBridge.saveSettings) YtDlpBridge.saveSettings(JSON.stringify(merged), merged.downloadPath || '');
              AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)).catch(()=>{});
          }

          setAppSettingsState(merged);
       } catch (error) {
           setIsInitialLoadDone(true);
       }
    };
    initializeApp();
  }, []);

  useEffect(() => {
      if (isInitialLoadDone) {
          const itemsToSave = items.filter(i => 
              i.stage === 'downloading' || i.stage === 'paused' || i.stage === 'error' ||
              (i.stage === 'finished' && i.type !== 'channel' && i.type !== 'playlist')
          );
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(itemsToSave)).catch(() => {});
      }
  }, [items, isInitialLoadDone]);

  // 2. DÜZELTME: AYARLARIN UNUTULMASI ENGELLENDİ.
  const setAppSettings = (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => {
    setAppSettingsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      // Yükleme tamamsa kaydet, değilse bekle.
      if (isInitialLoadDone) {
          if (YtDlpBridge && YtDlpBridge.saveSettings) YtDlpBridge.saveSettings(JSON.stringify(next), next.downloadPath || '');
          AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(()=>{});
      }
      return next;
    });
  };

  const appSettings = appSettingsState;
  const theme = appSettings.isDarkTheme ? darkTheme : lightTheme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const activeDownloadsCount = items.filter(i => i.stage === 'downloading').length;

  useEffect(() => {
    if (isGracefulExit && activeDownloadsCount === 0) BackHandler.exitApp();
  }, [isGracefulExit, activeDownloadsCount]);

  const handleIncomingShare = (text: string) => {
    if (!text) return;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex);
    if (matches && matches.length > 0) {
      const extractedUrl = matches[0];
      setLinksText(extractedUrl);
      processUrlList([extractedUrl]); 
    }
  };

  useEffect(() => {
    if (!YtDlpBridge) return;
    if (YtDlpBridge.getSharedLink) YtDlpBridge.getSharedLink().then((text: string) => handleIncomingShare(text));

    const eventEmitter = new NativeEventEmitter(YtDlpBridge as any);
    const shareSub = eventEmitter.addListener('SharedLinkReceived', (event: any) => { if (event && event.url) handleIncomingShare(event.url); });
    const fileFinSub = eventEmitter.addListener('FileFinished', (event: any) => {
        setItems(prev => {
            const parentItem = prev.find(i => i.id === event.parentId);
            if (!parentItem) return prev;

            if (parentItem.type === 'single_file' || parentItem.type === 'single_media') {
                return prev.map(i => i.id === event.parentId ? { ...i, fileUri: event.fileUri, title: event.fileName } : i);
            } else {
                const exists = prev.some(i => i.fileUri === event.fileUri);
                if (exists) return prev;
                const newId = event.parentId + "_file_" + Date.now();
                const newItem: Item = {
                    id: newId, url: parentItem.url, type: 'single_file', title: event.fileName, stage: 'finished',
                    size: t('completed'), rawSize: 0, progress: 100, speed: t('completed'), downloaded: t('completed'),
                    children: [], fileUri: event.fileUri, timestamp: Date.now(), thumbnail: parentItem.thumbnail
                };
                return [newItem, ...prev];
            }
        });
    });

    const dlSub = eventEmitter.addListener('DownloadProgress', (event: any) => {
      setItems(prev => prev.map(item => {
        if (item.id === event.id) {
          const line = event.line || '';
          const lowerLine = line.toLowerCase();
          
          if (lowerLine.includes('has already been recorded in archive') || lowerLine.includes('already been downloaded') || lowerLine.includes("doesn't match filter") || lowerLine.includes('requested format is not available')) {
              setItems(prevItems => {
                  const currentItem = prevItems.find(i => i.id === event.id);
                  if (!currentItem) return prevItems;
                  
                  if (currentItem.type === 'single_media' || currentItem.type === 'single_file') {
                       return prevItems.map(i => i.id === event.id ? { ...i, stage: 'error', type: 'skipped', errorMsg: t('errDuplicate'), time: new Date().toLocaleTimeString(), statusMsg: t('skipped') } : i);
                  } else {
                       const videoName = line.replace(/\[download\]|\[archive\]/gi, '').replace(/has already been recorded in archive|already been downloaded|doesn't match filter|Requested format is not available/gi, '').trim() || 'Video';
                       const isAlreadyLogged = prevItems.some(i => i.type === 'skipped' && i.title === videoName);
                       if (isAlreadyLogged) return prevItems;
                       const newLog: Item = {
                            id: event.id + '_skip_' + Math.random(), url: currentItem.url, type: 'skipped', title: videoName, stage: 'error',
                            errorMsg: t('skipped'), time: new Date().toLocaleTimeString(), timestamp: Date.now(), progress: 0, speed: '', downloaded: '', children: []
                       };
                       return [newLog, ...prevItems];
                  }
              });
          }

          let newSpeed = item.speed;
          let newDownloaded = item.downloaded;
          let newStatusMsg = item.statusMsg;
          let newProgression = item.progression;

          const speedMatch = line.match(/at\s+([0-9.]+[a-zA-Z]+\/s)/);
          if (speedMatch) newSpeed = speedMatch[1];
          
          const sizeMatch = line.match(/of\s+([0-9.]+[a-zA-Z]+)/);
          if (sizeMatch) newDownloaded = `${event.progress.toFixed(1)}% (${sizeMatch[1]})`;
          else if (line.includes('Destination') && !newDownloaded.includes('%')) newDownloaded = t('downloading');

          const itemMatch = line.match(/Downloading (?:item|video) (\d+) of (\d+)/);
          if (itemMatch) newProgression = `(${itemMatch[1]}/${itemMatch[2]})`;

          if (line.includes('Destination:') && (item.type === 'channel' || item.type === 'playlist')) {
              const fullPath = line.split('Destination:').pop()?.trim() || '';
              const fileName = fullPath.split('/').pop() || fullPath; 
              const cleanName = fileName.replace('.part', '').replace('.ytdl', ''); 
              const shortName = cleanName.length > 50 ? cleanName.substring(0, 50) + '...' : cleanName; 
              if (shortName) newStatusMsg = newProgression ? `${newProgression} ${shortName}` : shortName;
          } else if (newProgression && newStatusMsg && !newStatusMsg.startsWith(newProgression)) {
              if (newStatusMsg === t('optionsLoaded') || newStatusMsg === t('downloading')) newStatusMsg = `${newProgression} ${t('downloading')}`;
          }
          return { ...item, progress: event.progress, speed: newSpeed, downloaded: newDownloaded, statusMsg: newStatusMsg, progression: newProgression };
        }
        return item;
      }));
    });
    
    return () => { shareSub.remove(); dlSub.remove(); fileFinSub.remove(); };
  }, [appSettingsState.language]);

  useEffect(() => {
    if (activeDownloadsCount < appSettings.maxConcurrentDownloads) {
        const nextItem = items.find(i => i.stage === 'queued');
        if (nextItem) startDownloadProcess(nextItem);
    }
  }, [items, appSettings.maxConcurrentDownloads]);

  const stripParentheses = (text: string) => text.replace(/\s*\(.*?\)\s*/g, '').trim();
  
  const handlePickDirectory = async () => { 
    const selectedUri = await requestStoragePermission(); 
    if (selectedUri) setAppSettings({ downloadPath: selectedUri }); 
  };
  
  const handlePickCookies = async () => { 
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/plain' });
      if (!result.canceled && result.assets.length > 0) setAppSettings({ cookiesPath: result.assets[0].uri });
    } catch (err) {}
  };

  const handleLinksTextChange = (text: string) => { const lines = text.split('\n'); if (lines.length > MAX_LINKS) setLinksText(lines.slice(0, MAX_LINKS).join('\n')); else setLinksText(text); };
  
  const showExitAlert = () => {
    Alert.alert(
      t('exitTitle'),
      "",
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('exitGraceful'), onPress: () => { if (activeDownloadsCount === 0) BackHandler.exitApp(); else { setIsGracefulExit(true); Alert.alert(t('warning'), t('exitGraceful')); } } },
        { text: t('exitForce'), onPress: () => BackHandler.exitApp(), style: 'destructive' }
      ]
    );
  };

  const handleAnalyzeLinks = async () => {
    const rawLinks = [...new Set(linksText.split('\n').map(l => l.trim()).filter(l => l !== ''))];
    if (rawLinks.length === 0) return;

    if (!appSettings.downloadPath) {
        Alert.alert(t('warning'), t('errLocation'));
        setIsSettingsOpen(true); return;
    }

    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        await fetch('https://www.google.com/generate_204', { method: 'HEAD', signal: controller.signal });
    } catch (e) {
        Alert.alert(t('error'), t('errNoInternet')); return;
    }
    processUrlList(rawLinks);
  };

  const processUrlList = async (rawLinks: string[]) => {
    setActiveTab('ACTIVE'); 
    setLinksText(''); 

    for (const url of rawLinks) {
      const existsInActive = items.some(item => 
        item.url === url && 
        ['analyzing', 'analyzed', 'queued', 'downloading', 'paused'].includes(item.stage) &&
        item.type !== 'skipped'
      );
      if (existsInActive) continue; 
      
      setSessionLinks(prev => new Set(prev).add(url));
      const tempId = Date.now().toString() + Math.random().toString();
      
      setItems(prev => [{
        id: tempId, url, type: 'unknown', title: url, statusMsg: t('analyzingMsg'), stage: 'analyzing', size: '', rawSize: 0, progress: 0, speed: '0 KB/s', downloaded: '0 MB', children: [], timestamp: Date.now()
      }, ...prev]);

      setTimeout(() => { setItems(prev => prev.map(i => i.id === tempId ? { ...i, statusMsg: t('analyzingMsg') } : i)); }, 500);

      const analysis: AnalysisResult = await analyzeLink(url, appSettings.cookiesPath);
      
      let finalTitle = analysis.title;
      let finalSizeStr = t('unknown');
      let isError = false;
      let errorMsg = '';

      if (analysis.title.startsWith('HATA:')) {
        isError = true;
        errorMsg = analysis.title.replace('HATA:', '').trim();
      } else if (analysis.type === 'single_file') {
        const metadata = await fetchFileMetadata(url);
        if (metadata) {
          finalTitle = metadata.fileName || url.split('/').pop() || 'File';
          if (metadata.size > 0) finalSizeStr = (metadata.size / (1024 * 1024)).toFixed(1) + ' MB';
        } else {
          isError = true; errorMsg = t('errServer');
        }
      }

      setItems(prev => prev.map(item => {
        if (item.id === tempId) {
          if (isError) return { ...item, type: analysis.type, title: t('error'), size: t('unknown'), stage: 'error', errorMsg, time: new Date().toLocaleTimeString() };
          
          const defaultFormatId = analysis.availableFormats && analysis.availableFormats.length > 0 ? analysis.availableFormats[0].id : 'none';
          const defaultSubId = analysis.availableSubtitles && analysis.availableSubtitles.length > 0 ? analysis.availableSubtitles[0].id : 'none';
          const defaultTabId = analysis.availableTabs && analysis.availableTabs.length > 0 ? analysis.availableTabs[0] : undefined;

          return { 
            ...item, type: analysis.type, title: finalTitle, statusMsg: t('optionsLoaded'), size: analysis.type === 'single_file' ? finalSizeStr : t('optionsLoaded'), 
            thumbnail: analysis.thumbnail, contentCount: analysis.contentCount, availableFormats: analysis.availableFormats, availableSubtitles: analysis.availableSubtitles, availableTabs: analysis.availableTabs,
            selectedFormatId: defaultFormatId, selectedSubId: defaultSubId, selectedTab: defaultTabId, rangeMode: 'all', rangeInput: '', stage: 'analyzed'
          };
        }
        return item;
      }));
    }
  };

  const handleTabChange = async (id: string, newTab: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, selectedTab: newTab, statusMsg: t('analyzingMsg'), contentCount: 0 } : i));
    const targetItem = items.find(i => i.id === id);
    if (!targetItem) return;

    const tabUrl = targetItem.url.split('?')[0] + '/' + newTab.toLowerCase();
    try {
        const analysis = await analyzeLink(tabUrl, appSettings.cookiesPath);
        setItems(prev => prev.map(i => i.id === id ? { ...i, contentCount: analysis.contentCount, statusMsg: t('optionsLoaded') } : i));
    } catch (e) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, statusMsg: t('error') } : i));
    }
  };

  const handleQueue = (id: string) => {
    const targetItem = items.find(i => i.id === id);
    if (!targetItem) return;
    if ((targetItem.type === 'channel' || targetItem.type === 'playlist') && targetItem.rangeMode === 'custom' && (!targetItem.rangeInput || targetItem.rangeInput.trim() === '')) {
      Alert.alert(t('warning'), t('rangeSelect')); return;
    }
    setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'queued', size: '', speed: t('queued'), progress: 0 } : item));
  };

  const startDownloadProcess = async (targetItem: Item) => {
    const id = targetItem.id;
    setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'downloading', speed: '...' } : item));

    if (targetItem.type === 'single_file') {
      (startFileDownload as any)(
        id, targetItem.url, appSettings.downloadPath, appSettings.smartFolder,
        (progress: number, downloadedStr: string, speedStr: string) => { setItems(prev => prev.map(item => item.id === id ? { ...item, progress, downloaded: downloadedStr, speed: speedStr } : item)); },
        (finalPath: string) => { setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'finished', progress: 100, speed: t('completed'), fileUri: finalPath } : item)); },
        async (errorMsg: string) => {
          if (errorMsg === 'DUPLICATE_SKIPPED') setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'error', type: 'skipped', errorMsg: t('skipped'), time: new Date().toLocaleTimeString() } : item));
          else setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'error', errorMsg: errorMsg, time: new Date().toLocaleTimeString() } : item));
        }
      );
    } else {
      try {
        let format = targetItem.selectedFormatId || 'b1';
        let sub = targetItem.selectedSubId || 'none';
        let dUrl = targetItem.url;
        
        if (targetItem.type === 'channel') {
           const tab = targetItem.selectedTab ? targetItem.selectedTab.toLowerCase() : 'videos';
           dUrl = targetItem.url.split('?')[0] + '/' + tab;
        }

        let rangeStr = 'all';
        if ((targetItem.type === 'channel' || targetItem.type === 'playlist') && targetItem.rangeMode === 'custom') rangeStr = targetItem.rangeInput || 'all';

        let smartFolderName = '';
        if (appSettings.smartFolder) {
             if (format === 'mp3' || format === 'm4a' || format === 'opus') smartFolderName = 'Audio';
             else smartFolderName = 'Videos';
        }

        let finalSubId = sub;
        if (sub === 'auto_seq') finalSubId = `${appSettings.subLang1.toLowerCase()},${appSettings.subLang2.toLowerCase()},${appSettings.subLang3.toLowerCase()}`;
        else if (sub === 'only_first') finalSubId = appSettings.subLang1.toLowerCase();

        const isBulk = (targetItem.type === 'channel' || targetItem.type === 'playlist');

        const res = await YtDlpBridge.downloadMedia(id, dUrl, format, finalSubId, rangeStr, appSettings.downloadPath, smartFolderName, appSettings.cookiesPath, isBulk);
        
        if (res !== 'DOWNLOAD_CANCELLED') {
             setItems(prev => prev.map(item => {
                if (item.id === id) {
                    if (item.stage === 'error') return item;
                    return { 
                      ...item, stage: 'finished', progress: 100, speed: t('completed'), 
                      fileUri: (res !== 'DOWNLOAD_OK' && res !== 'DOWNLOAD_OK_WITH_WARNINGS') ? res : item.fileUri 
                    };
                }
                return item;
             }));
        }
      } catch (error: any) {
        setItems(prev => {
            const currentItem = prev.find(i => i.id === id);
            if (currentItem && currentItem.stage === 'paused') return prev; 
            return prev.map(item => item.id === id ? { ...item, stage: 'error', errorMsg: String(error), time: new Date().toLocaleTimeString() } : item);
        });
      }
    }
  };

  const handleTogglePlayPause = async (id: string) => {
    const targetItem = items.find(i => i.id === id);
    if (!targetItem) return;

    if (targetItem.stage === 'downloading') {
        if (targetItem.type === 'single_file') {
            const resumeData = await pauseDownload(id);
            setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'paused', speed: t('paused'), resumeData: resumeData || undefined } : item));
        } else {
            setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'paused', speed: t('paused') } : item));
            await YtDlpBridge.cancelDownload(id);
        }
    } else if (targetItem.stage === 'paused') {
        setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'downloading', speed: '...' } : item));
        try {
            if (targetItem.type === 'single_file' && targetItem.resumeData) {
                // 3. DÜZELTME: init İÇİNDEKİ (true) PARAMETRESİ SİLİNDİ
                if (YtDlpBridge && YtDlpBridge.init) await YtDlpBridge.init();
                (resumeDownload as any)(
                    id, targetItem.resumeData,
                    (progress: number, downloadedStr: string, speedStr: string) => { setItems(prev => prev.map(item => item.id === id ? { ...item, progress, downloaded: downloadedStr, speed: speedStr } : item)); },
                    (finalPath: string) => { setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'finished', progress: 100, speed: t('completed'), fileUri: finalPath } : item)); }
                );
            } else {
                // 3. DÜZELTME: init İÇİNDEKİ (true) PARAMETRESİ SİLİNDİ
                if (YtDlpBridge && YtDlpBridge.init) await YtDlpBridge.init();
                startDownloadProcess(targetItem);
            }
        } catch (e: any) {
             Alert.alert(t('error'), "İndirme motoru hazırlanamadı. Lütfen indirmeyi iptal edip tekrar deneyin.");
             setItems(prev => prev.map(item => item.id === id ? { ...item, stage: 'error', errorMsg: String(e.message || e) } : item));
        }
    }
  };

  const handlePauseAll = async () => {
    const downloadingItems = items.filter(i => i.stage === 'downloading');
    for (const item of downloadingItems) await handleTogglePlayPause(item.id);
  };

  const handleResumeAll = () => {
    const pausedItems = items.filter(i => i.stage === 'paused');
    for (const item of pausedItems) handleTogglePlayPause(item.id);
  };

  const handleDelete = (id: string) => {
    const itemToDelete = items.find(i => i.id === id);
    if (itemToDelete) setSessionLinks(prev => { const newSet = new Set(prev); newSet.delete(itemToDelete.url); return newSet; });
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleDeleteAll = () => {
    const itemsToDelete = getActiveTabItems(); 
    const idsToDelete = new Set(itemsToDelete.map(i => i.id));
    setSessionLinks(prev => { const newSet = new Set(prev); itemsToDelete.forEach(item => newSet.delete(item.url)); return newSet; });
    setItems(prev => prev.filter(item => !idsToDelete.has(item.id)));
    setIsFilterMenuOpen(false); 
  };

  const toggleExpand = (id: string) => setItems(prev => prev.map(item => item.id === id ? { ...item, isExpanded: !item.isExpanded } : item));
  
  const updateItemSelection = (id: string, field: 'format' | 'subtitle' | 'tab' | 'rangeMode' | 'rangeInput', value: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        if (field === 'format') return { ...item, selectedFormatId: value };
        if (field === 'subtitle') return { ...item, selectedSubId: value };
        if (field === 'tab') return { ...item, selectedTab: value };
        if (field === 'rangeMode') return { ...item, rangeMode: value as any };
        if (field === 'rangeInput') return { ...item, rangeInput: value };
      }
      return item;
    }));
  };

  const getSortedItems = (tabItems: Item[]) => [...tabItems].sort((a, b) => {
    if (sortOption === 'date_desc') return (b.timestamp || 0) - (a.timestamp || 0);
    if (sortOption === 'date_asc') return (a.timestamp || 0) - (b.timestamp || 0);
    if (sortOption === 'name_asc') return a.title.localeCompare(b.title);
    if (sortOption === 'size_desc') return (b.rawSize || 0) - (a.rawSize || 0);
    return 0;
  });

  const getActiveTabItems = () => {
    let tabItems: Item[] = [];
    if (activeTab === 'ACTIVE') tabItems = items.filter(i => (i.stage === 'downloading' || i.stage === 'paused' || i.stage === 'analyzing' || i.stage === 'analyzed' || i.stage === 'queued') && i.type !== 'skipped');
    else if (activeTab === 'FINISHED') tabItems = items.filter(i => i.stage === 'finished' && i.type !== 'channel' && i.type !== 'playlist');
    else if (activeTab === 'LOGS') tabItems = items.filter(i => i.stage === 'error' || i.type === 'skipped');
    return getSortedItems(tabItems);
  };

  const currentItems = getActiveTabItems();

  const handleCopyToClipboard = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert(t('copied'), text);
    } catch (e) {
      Alert.alert(t('error'), "Kopyalanamadı.");
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Image source={require('./assets/ridm_logo.png')} style={{ width: 110, height: 35, resizeMode: 'contain' }} />
      <View style={styles.headerIcons}>
        <TouchableOpacity onPress={showExitAlert} style={styles.iconBtn}><Power size={18} color={theme.danger} /></TouchableOpacity>
        <TouchableOpacity onPress={() => setIsHelpOpen(true)} style={styles.iconBtn}><HelpCircle size={18} color={theme.textSub} /></TouchableOpacity>
        
        <TouchableOpacity 
           onPress={() => setSelectModal({visible: true, itemId: '', field: 'appLang', title: t('selectLanguage'), options: [
             {id:'TR', label:'🇹🇷 Türkçe (TR)'}, {id:'EN', label:'🇬🇧 English (EN)'}, {id:'AR', label:'🇸🇦 العربية (AR)'}, 
             {id:'ZH', label:'🇨🇳 中文 (ZH)'}, {id:'HI', label:'🇮🇳 हिन्दी (HI)'}, {id:'ES', label:'🇪🇸 Español (ES)'}, 
             {id:'FR', label:'🇫🇷 Français (FR)'}, {id:'BN', label:'🇧🇩 বাংলা (BN)'}, {id:'RU', label:'🇷🇺 Русский (RU)'}
           ]})} 
           style={[styles.iconBtn, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
        >
            <Globe size={16} color={theme.textSub} />
            <Text style={{fontSize: 10, fontWeight: 'bold', color: theme.textSub}}>{appSettings.language}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSettingsOpen(true)} style={styles.iconBtn}><Settings size={18} color={theme.textSub} /></TouchableOpacity>
      </View>
    </View>
  );

  const renderInputArea = () => (
    <View style={styles.inputContainer}>
      <TextInput style={styles.input} multiline placeholder={t('inputPlaceholder')} placeholderTextColor={theme.textSub} value={linksText} onChangeText={handleLinksTextChange} />
      <View style={styles.inputFooter}>
        <Text style={styles.linkCount}>{linksText.split('\n').filter(l=>l).length} / {MAX_LINKS}</Text>
        <View style={{ flex: 1 }} />
        {linksText.length > 0 && <TouchableOpacity onPress={() => setLinksText('')} style={styles.clearBtn}><Trash2 size={18} color={theme.textSub} /></TouchableOpacity>}
        <TouchableOpacity style={[styles.analyzeBtn, !linksText.trim() && styles.analyzeBtnDisabled]} onPress={handleAnalyzeLinks} disabled={!linksText.trim()}>
          <Link2 size={12} color={linksText.trim() ? "#fff" : theme.textSub} />
          <Text style={[styles.analyzeBtnText, !linksText.trim() && styles.analyzeBtnTextDisabled]}>{t('analyzeBtn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTabs = () => {
    const tabs = [
      { id: 'ACTIVE', label: t('activeTab'), count: items.filter(i => (i.stage === 'downloading' || i.stage === 'paused' || i.stage === 'analyzing' || i.stage === 'analyzed' || i.stage === 'queued') && i.type !== 'skipped').length },
      { id: 'FINISHED', label: t('finishedTab'), count: items.filter(i => i.stage === 'finished' && i.type !== 'channel' && i.type !== 'playlist').length },
      { id: 'LOGS', label: t('logsTab'), count: items.filter(i => i.stage === 'error' || i.type === 'skipped').length }
    ];

    return (
      <View style={{ marginBottom: 10 }}>
        <View style={styles.tabBarWrapper}>
          <View style={styles.tabContainer}>
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity key={tab.id} style={styles.tabBtn} onPress={() => setActiveTab(tab.id as any)}>
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
                  <View style={[styles.badge, isActive && styles.badgeActive]}><Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{tab.count}</Text></View>
                  {isActive && <View style={styles.activeIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity onPress={() => setIsFilterMenuOpen(true)} style={styles.filterBtn}><ListFilter size={18} color={theme.textSub} /></TouchableOpacity>
        </View>
        {activeTab === 'ACTIVE' && currentItems.filter(i => i.stage === 'downloading' || i.stage === 'paused').length > 0 && (
            <View style={styles.activeActionBar}>
                <TouchableOpacity onPress={handlePauseAll} style={styles.bulkControlBtn}>
                    <Pause size={14} color={theme.textMain} /><Text style={styles.bulkControlText}>{t('pauseAll')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleResumeAll} style={styles.bulkControlBtn}>
                    <Play size={14} color={theme.textMain} /><Text style={styles.bulkControlText}>{t('resumeAll')}</Text>
                </TouchableOpacity>
            </View>
        )}
      </View>
    );
  };

  const renderAnalysisCard = (item: Item) => {
    const isMedia = item.type === 'single_media' || item.type === 'channel' || item.type === 'playlist';
    const isBulk = item.type === 'channel' || item.type === 'playlist';
    
    const getFormatLabel = (id: string, isPickup: boolean, itemType: string) => {
      const format = item.availableFormats?.find(f => f.id === id);
      if (!format) return t('formatSelect');
      
      let baseLabel = format.label;
      if (id === 'b1' || id === 'best') baseLabel = isPickup ? t('bestVideo') + ' (Default)' : t('bestVideo');
      else baseLabel = stripParentheses(baseLabel); 

      if (itemType !== 'single_media' && (baseLabel.includes('2160') || baseLabel.includes('1080'))) {
          baseLabel += ` ${t('ifNotAvail')}`;
      }
      
      // mp3/m4a/opus used to show different "(Audio only)" / "(Audio + Sub)" labels here,
      // but all three now embed lyrics the same way, so the distinction no longer applies.

      return baseLabel;
    };

    let dynamicSubOptions = [];
    if (isBulk) {
        const s1 = appSettings.subLang1 && appSettings.subLang1 !== 'BOŞ' ? appSettings.subLang1 : 'EN';
        const s2 = appSettings.subLang2 && appSettings.subLang2 !== 'BOŞ' ? appSettings.subLang2 : 'EN';
        const s3 = appSettings.subLang3 && appSettings.subLang3 !== 'BOŞ' ? appSettings.subLang3 : 'EN';
        
        dynamicSubOptions = [
            { id: 'none', label: t('noSub') },
            { id: 'auto_seq', label: `${t('autoSeq')} ${s1}>${s2}>${s3}` },
            { id: 'only_first', label: `${t('onlyFirst')} ${s1}` }
        ];
    } else {
        dynamicSubOptions = [{id: 'none', label: t('noSub')}, ...(item.availableSubtitles || [])];
    }

    const selectedFormatLabel = getFormatLabel(item.selectedFormatId || '', false, item.type);
    const selectedSubLabel = dynamicSubOptions.find(s => s.id === item.selectedSubId)?.label || t('noSub');
    
    let badgeLabel = 'FILE'; let badgeColor = theme.primary; 
    if (item.type === 'single_media') { badgeLabel = 'MEDIA'; badgeColor = '#8b5cf6'; } 
    if (item.type === 'channel') { badgeLabel = 'CHANNEL'; badgeColor = '#f59e0b'; } 
    if (item.type === 'playlist') { badgeLabel = 'PLAYLIST'; badgeColor = '#ec4899'; } 

    const isDownloadDisabled = !appSettings.downloadPath || item.stage === 'analyzing';

    return (
      <View key={item.id} style={styles.analysisCard}>
        <View style={styles.topRow}>
          <View style={[styles.badgeContainer, { backgroundColor: badgeColor }]}><Text style={styles.badgeLabel}>{badgeLabel}</Text></View>
          <Text style={styles.itemSubtitle}>{item.stage === 'analyzing' ? (item.statusMsg || t('analyzingMsg')) : (item.type === 'single_file' ? item.size : item.statusMsg)}</Text>
        </View>
        <View style={{ marginTop: 5, marginBottom: 6 }}><Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text></View>
        {isMedia && item.stage !== 'analyzing' && (
          <View>
            <View style={styles.mediaContentRow}>
              {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={styles.analysisThumb} /> : <View style={styles.analysisThumbPlaceholder}><File size={24} color={theme.textSub} /></View>}
              <View style={styles.mediaDropdownsCol}>
                {item.availableFormats && item.availableFormats.length > 0 && (
                  <TouchableOpacity style={styles.dropdownBtn} onPress={() => setSelectModal({ visible: true, itemId: item.id, field: 'format', title: t('formatSelect'), options: item.availableFormats!.map(f => ({id: f.id, label: getFormatLabel(f.id, true, item.type)})) })}>
                    <Text style={styles.dropdownBtnText} numberOfLines={1}>{selectedFormatLabel}</Text><ChevronDown size={14} color={theme.textSub} />
                  </TouchableOpacity>
                )}
                {dynamicSubOptions.length > 0 && (
                  <TouchableOpacity style={styles.dropdownBtn} onPress={() => setSelectModal({ visible: true, itemId: item.id, field: 'subtitle', title: t('subSelect'), options: dynamicSubOptions })}>
                    <Text style={styles.dropdownBtnText} numberOfLines={1}>{selectedSubLabel}</Text><ChevronDown size={14} color={theme.textSub} />
                  </TouchableOpacity>
                )}
                {item.type === 'channel' && item.availableTabs && item.availableTabs.length > 0 && (
                  <TouchableOpacity style={[styles.dropdownBtn, { borderColor: theme.primary }]} onPress={() => setSelectModal({ visible: true, itemId: item.id, field: 'tab', title: t('tabSelect'), options: item.availableTabs!.map(t => ({id: t, label: t})) })}>
                    <Text style={[styles.dropdownBtnText, { color: theme.primary }]} numberOfLines={1}>Tab: {item.selectedTab}</Text><ChevronDown size={14} color={theme.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {isBulk && (
              <View style={styles.bulkContainer}>
                <Text style={styles.contentCountText}>{t('contentCount')} <Text style={{color: theme.textMain}}>{item.contentCount}</Text></Text>
                <View style={styles.rangeRow}>
                  <View style={styles.rangeLeftGroup}>
                    <TouchableOpacity style={styles.radioBtn} onPress={() => updateItemSelection(item.id, 'rangeMode', 'custom')}>
                      <View style={[styles.radioCircle, item.rangeMode === 'custom' && styles.radioCircleActive]}>{item.rangeMode === 'custom' && <View style={styles.radioInner} />}</View>
                      <Text style={styles.radioText}>{t('rangeSelect')}</Text>
                    </TouchableOpacity>
                    <TextInput style={styles.rangeInput} placeholder="ex: 1,4,6-9" placeholderTextColor={theme.textSub} value={item.rangeInput} editable={item.rangeMode === 'custom'} onChangeText={(val) => updateItemSelection(item.id, 'rangeInput', val)} />
                  </View>
                  <TouchableOpacity style={styles.radioBtn} onPress={() => updateItemSelection(item.id, 'rangeMode', 'all')}>
                    <View style={[styles.radioCircle, item.rangeMode === 'all' && styles.radioCircleActive]}>{item.rangeMode === 'all' && <View style={styles.radioInner} />}</View>
                    <Text style={styles.radioText}>{t('downloadAll')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.cardBtn, styles.btnCancel]}><Text style={styles.btnCancelText}>{t('cancel')}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => handleQueue(item.id)} style={[styles.cardBtn, isDownloadDisabled ? styles.btnQueueDisabled : styles.btnQueue]} disabled={isDownloadDisabled}>
            <Text style={[styles.btnQueueText, isDownloadDisabled && { color: theme.textSub }]}>{t('addToQueue')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDownloadCard = (item: Item) => (
    <View key={item.id} style={styles.downloadCard}>
      <View style={styles.downloadCardInner}>
        <View style={styles.thumbPlaceholder}>{item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={{ width: '100%', height: '100%', borderRadius: 8 }} /> : <File size={20} color={theme.textSub} />}</View>
        <View style={styles.downloadInfo}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
          {item.statusMsg && item.statusMsg !== t('optionsLoaded') && (
             <Text style={{fontSize: 10, color: theme.primary, marginTop: 2, fontWeight: 'bold'}} numberOfLines={1}>{item.statusMsg}</Text>
          )}
          <View style={styles.progressRow}><Text style={styles.progressText}>{item.downloaded}</Text><Text style={styles.speedText}>{item.speed}</Text></View>
          <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: item.progress + '%' }]} /></View>
        </View>
        <View style={styles.downloadActions}>
          <TouchableOpacity onPress={() => handleTogglePlayPause(item.id)} style={styles.actionBtn}>
              {item.stage === 'paused' ? <Play size={14} color={theme.textMain} /> : <Pause size={14} color={theme.textMain} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}><Trash2 size={14} color="#ef4444" /></TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderFinishedCard = (item: Item) => (
    <TouchableOpacity key={item.id} style={styles.finishedCard} activeOpacity={0.8} onPress={() => toggleExpand(item.id)}>
      <View style={styles.finishedCardInner}>
        <View style={styles.thumbPlaceholderFinished}><CheckCircle2 size={20} color="#22c55e" /></View>
        <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.progressText}>{item.size} • {t('completed')}</Text></View>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteFinishedBtn}><Trash2 size={16} color={theme.textSub} /></TouchableOpacity>
      </View>
      {item.isExpanded && (
        <View style={styles.finishedActionsRow}>
          <TouchableOpacity style={styles.finishedActionBtn} onPress={() => {
              if (item.fileUri && YtDlpBridge && YtDlpBridge.openFile) {
                  YtDlpBridge.openFile(item.fileUri).catch(() => Alert.alert(t('error'), t('error')));
              }
          }}>
            <ExternalLink size={14} color={theme.primary} /><Text style={styles.finishedActionText}>{t('open')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.finishedActionBtn} onPress={() => {
               if (item.fileUri && YtDlpBridge && YtDlpBridge.shareFile) {
                   YtDlpBridge.shareFile(item.fileUri).catch(()=>{});
               }
          }}>
            <Share2 size={14} color={theme.primary} /><Text style={styles.finishedActionText}>{t('share')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.finishedActionBtn} onPress={() => {
              if (item.fileUri && YtDlpBridge && YtDlpBridge.showFileInFolder) {
                  YtDlpBridge.showFileInFolder(item.fileUri).catch(()=>{});
               }
          }}>
            <FolderOutput size={14} color={theme.primary} /><Text style={styles.finishedActionText}>{t('showInFolder')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderLogCard = (item: Item) => (
    <View key={item.id} style={[styles.logCard, item.type === 'skipped' ? styles.logCardSkip : styles.logCardError]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[styles.logBadge, item.type === 'skipped' ? styles.logBadgeSkip : styles.logBadgeError]}>{item.type === 'skipped' ? t('skipped').toUpperCase() : t('error').toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={styles.logTime}>{item.time}</Text>
          <TouchableOpacity onPress={() => handleDelete(item.id)}><Trash2 size={14} color={item.type === 'skipped' ? "#60a5fa" : "#f87171"} /></TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.itemTitle, { marginTop: 6 }]} selectable={true}>{item.title || item.url}</Text>
      <Text style={styles.logMessage} selectable={true}>{item.errorMsg}</Text>
    </View>
  );

  const renderSettingsPanel = () => (
    <Modal visible={isSettingsOpen} transparent animationType="none" onRequestClose={() => setIsSettingsOpen(false)}>
      <View style={styles.settingsOverlay}>
        <TouchableOpacity style={styles.settingsCloseTouch} onPress={() => setIsSettingsOpen(false)} />
        <View style={styles.settingsPanel}>
          <View style={styles.settingsHeader}><Text style={styles.settingsTitle}>{t('settingsTitle')}</Text><TouchableOpacity onPress={() => setIsSettingsOpen(false)}><X size={20} color={theme.textMain} /></TouchableOpacity></View>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>{t('downloadLoc')}</Text>
            <TouchableOpacity style={styles.settingsActionRow} onPress={handlePickDirectory}><Folder size={16} color={theme.primary} />
               <Text style={styles.settingsRowText} numberOfLines={1}>{appSettings.downloadPath ? t('locSet') : t('locNotSet')}</Text>
            </TouchableOpacity>
            {appSettings.downloadPath ? <Text style={styles.pathSubText} numberOfLines={2} ellipsizeMode="head">...{decodeURIComponent(appSettings.downloadPath).replace('content://com.android.externalstorage.documents/tree/primary:', 'Dahili Depolama/')}</Text> : null}
            <View style={styles.settingsSwitchRow}><View style={{ flex: 1, marginRight: 8 }}><Text style={styles.settingsSwitchTitle}>{t('smartFolder')}</Text><Text style={styles.settingsSwitchSub}>{t('smartFolderSub')}</Text></View><Switch value={appSettings.smartFolder} onValueChange={(val) => setAppSettings({ smartFolder: val })} trackColor={{ false: theme.borderLight, true: theme.primary }} thumbColor="#fff" /></View>
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>{t('maxConcurrent')}</Text>
            <View style={styles.numberButtonGroup}>{[1, 2, 3, 4, 5].map(num => (<TouchableOpacity key={num} style={[styles.numberBtn, appSettings.maxConcurrentDownloads === num && styles.numberBtnActive]} onPress={() => setAppSettings({ maxConcurrentDownloads: num })}><Text style={[styles.numberBtnText, appSettings.maxConcurrentDownloads === num && { color: '#fff' }]}>{num}</Text></TouchableOpacity>))}</View>
            
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>{t('subPref')}</Text>
            <View style={styles.subLangInputGroup}>
              <View style={styles.subLangCol}>
                  <Text style={styles.subLangLabel}>{t('lang1')}</Text>
                  <TouchableOpacity style={styles.subLangInputBtn} onPress={() => setSelectModal({visible: true, itemId: '', field: 'subLang1', title: t('lang1'), options: LANGUAGES})}>
                      <Text style={styles.subLangInputText}>{appSettings.subLang1}</Text>
                  </TouchableOpacity>
              </View>
              <View style={styles.subLangCol}>
                  <Text style={styles.subLangLabel}>{t('lang2')}</Text>
                  <TouchableOpacity style={styles.subLangInputBtn} onPress={() => setSelectModal({visible: true, itemId: '', field: 'subLang2', title: t('lang2'), options: LANGUAGES})}>
                      <Text style={styles.subLangInputText}>{appSettings.subLang2}</Text>
                  </TouchableOpacity>
              </View>
              <View style={styles.subLangCol}>
                  <Text style={styles.subLangLabel}>{t('lang3')}</Text>
                  <TouchableOpacity style={styles.subLangInputBtn} onPress={() => setSelectModal({visible: true, itemId: '', field: 'subLang3', title: t('lang3'), options: LANGUAGES})}>
                      <Text style={styles.subLangInputText}>{appSettings.subLang3}</Text>
                  </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>{t('auth')}</Text>
            <TouchableOpacity style={styles.settingsActionRow} onPress={handlePickCookies}><Cookie size={16} color={theme.textSub} />
               <Text style={styles.settingsRowText} numberOfLines={1}>{appSettings.cookiesPath ? t('cookiesSet') : t('cookiesNotSet')}</Text>
            </TouchableOpacity>
            
            <View style={[styles.settingsSwitchRow, { marginTop: 16 }]}><View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>{appSettings.isDarkTheme ? <Moon size={16} color={theme.primary} /> : <Sun size={16} color="#f59e0b" />}<Text style={styles.settingsSwitchTitle}>{appSettings.isDarkTheme ? t('darkTheme') : t('lightTheme')}</Text></View><Switch value={appSettings.isDarkTheme} onValueChange={(val) => setAppSettings({ isDarkTheme: val })} trackColor={{ false: theme.borderLight, true: theme.primary }} thumbColor="#fff" /></View>

            <View style={[styles.settingsSwitchRow, { marginTop: 12 }]}><View style={{ flex: 1, marginRight: 8 }}><Text style={styles.settingsSwitchTitle}>{t('autoUpdateEngine')}</Text><Text style={styles.settingsSwitchSub}>{t('autoUpdateEngineSub')}</Text></View><Switch value={!!appSettings.ytdlpAutoUpdate} onValueChange={(val) => setAppSettings({ ytdlpAutoUpdate: val })} trackColor={{ false: theme.borderLight, true: theme.primary }} thumbColor="#fff" /></View>
            
            {/* DÜZENLENEN İLETİŞİM & DESTEK KARTI */}
            <View style={styles.supportCard}>
               <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingHorizontal: 4 }}>
                   <Mail size={18} color={theme.primary} />
                   <Text style={styles.supportTitle}>{t('supportTitle')}</Text>
                   <Coffee size={18} color={theme.primary} />
               </View>
               <View style={styles.supportInfo}>
                   <Text style={styles.supportDesc}>{t('supportDesc')}</Text>
                   
                   <TouchableOpacity style={styles.donateBtn} onPress={() => setIsDonateModalOpen(true)}>
                       <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                           <Wallet size={14} color="#fff" />
                           <Text style={styles.donateBtnText}>{t('donateBtn')}</Text>
                       </View>
                       <Text style={styles.donateSubText}>(BTC, LTC, USDT-TRC20)</Text>
                   </TouchableOpacity>

                   <Text style={styles.quoteText}>
                       "{t('quote')}"
                   </Text>

                   <TouchableOpacity onPress={() => Linking.openURL('mailto:mremiyum@proton.me')}>
                       <Text style={styles.mailText}>mremiyum@proton.me</Text>
                   </TouchableOpacity>
               </View>
            </View>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  if (!isInitialLoadDone) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={appSettings.isDarkTheme ? "light-content" : "dark-content"} backgroundColor={theme.bgMain} translucent={true} />
      <View style={[styles.container, isTablet ? { maxWidth: 800, width: '100%', alignSelf: 'center' } : undefined]}>
        {renderHeader()}
        {renderInputArea()}
        {renderTabs()}
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {currentItems.map(item => {
            if (activeTab === 'ACTIVE') { if (item.stage === 'analyzing' || item.stage === 'analyzed' || item.stage === 'queued') return renderAnalysisCard(item); return renderDownloadCard(item); }
            if (activeTab === 'FINISHED') return renderFinishedCard(item);
            if (activeTab === 'LOGS') return renderLogCard(item);
            return null;
          })}
          {currentItems.length === 0 && <Text style={styles.emptyText}>{t('emptyTab')}</Text>}
        </ScrollView>
      </View>

      {renderSettingsPanel()}

      {/* DÜZENLENEN KRİPTO BAĞIŞ MODALI */}
      <Modal visible={isDonateModalOpen} transparent animationType="slide" onRequestClose={() => setIsDonateModalOpen(false)}>
        <View style={styles.modalOverlayBottom}>
          <View style={[styles.bottomSheet, { maxHeight: '90%' }]}>
            <Text style={styles.bottomSheetTitle}>{t('donateBtn')}</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              
              {/* Bitcoin */}
              <View style={styles.cryptoCard}>
                <Image source={require('./assets/qr_btc.png')} style={styles.qrImage} defaultSource={require('./assets/ridm_logo.png')} />
                <Text style={styles.cryptoName}>Bitcoin (BTC)</Text>
                <View style={styles.cryptoAddressRow}>
                  <Text style={styles.cryptoInputText} selectable={true}>bc1qa5v5vlppp5nn9kdtt2wz4x9pfuupm92hjpd6eu</Text>
                  <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopyToClipboard("bc1qa5v5vlppp5nn9kdtt2wz4x9pfuupm92hjpd6eu")}>
                    <Copy size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Litecoin */}
              <View style={styles.cryptoCard}>
                <Image source={require('./assets/qr_ltc.png')} style={styles.qrImage} defaultSource={require('./assets/ridm_logo.png')} />
                <Text style={styles.cryptoName}>Litecoin (LTC)</Text>
                <View style={styles.cryptoAddressRow}>
                  <Text style={styles.cryptoInputText} selectable={true}>Lf4HincsmEvEJ1cxwJkomXLN72JH7etWRY</Text>
                  <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopyToClipboard("Lf4HincsmEvEJ1cxwJkomXLN72JH7etWRY")}>
                    <Copy size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* USDT Tron */}
              <View style={styles.cryptoCard}>
                <Image source={require('./assets/qr_usdt.png')} style={styles.qrImage} defaultSource={require('./assets/ridm_logo.png')} />
                <Text style={styles.cryptoName}>Tron (USDT-TRC20)</Text>
                <View style={styles.cryptoAddressRow}>
                  <Text style={styles.cryptoInputText} selectable={true}>TUZksjGTYmSeKaprQJQtomTdPXb4ew9mrp</Text>
                  <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopyToClipboard("TUZksjGTYmSeKaprQJQtomTdPXb4ew9mrp")}>
                    <Copy size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

            </ScrollView>
            <TouchableOpacity onPress={() => setIsDonateModalOpen(false)} style={styles.closeSheetBtn}>
              <Text style={styles.exitCancelText}>{t('close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={selectModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlayBottom}>
          <View style={styles.bottomSheet}>
            <Text style={styles.bottomSheetTitle}>{selectModal.title}</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {selectModal.options.map(opt => {
                const isAudioOpt = opt.id === 'mp3' || opt.id === 'm4a' || opt.id === 'opus';
                return (
                  <TouchableOpacity key={opt.id} 
                    style={[
                      styles.sortOptionRow, 
                      isAudioOpt && { backgroundColor: appSettings.isDarkTheme ? 'rgba(6, 182, 212, 0.12)' : 'rgba(8, 145, 178, 0.12)', borderBottomWidth: 0, borderRadius: 8, marginTop: 4, paddingHorizontal: 12 }
                    ]} 
                    onPress={() => { 
                      if (selectModal.field === 'tab') { handleTabChange(selectModal.itemId, opt.id); } 
                      else if (selectModal.field === 'appLang') { setAppSettings({ language: opt.id as any }); }
                      else if (selectModal.field.startsWith('subLang')) { setAppSettings({ [selectModal.field]: opt.id }); }
                      else { updateItemSelection(selectModal.itemId, selectModal.field as any, opt.id); }
                      setSelectModal({ ...selectModal, visible: false }); 
                    }}>
                    <Text style={[styles.sortOptionText, isAudioOpt && { color: theme.primary, fontWeight: 'bold' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
            <TouchableOpacity onPress={() => setSelectModal({ ...selectModal, visible: false })} style={styles.closeSheetBtn}><Text style={styles.exitCancelText}>{t('cancel')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isFilterMenuOpen} transparent animationType="slide">
        <View style={styles.modalOverlayBottom}>
          <View style={styles.bottomSheet}>
            <Text style={styles.bottomSheetTitle}>{t('sortTitle')}</Text>
            <Text style={styles.sectionLabel}>{t('sortOptions')}</Text>
            <TouchableOpacity style={styles.sortOptionRow} onPress={() => { setSortOption('date_desc'); setIsFilterMenuOpen(false); }}><Text style={[styles.sortOptionText, sortOption === 'date_desc' && styles.sortOptionTextActive]}>{t('sortNewOld')}</Text>{sortOption === 'date_desc' && <CheckCircle2 size={16} color={theme.primary} />}</TouchableOpacity>
            <TouchableOpacity style={styles.sortOptionRow} onPress={() => { setSortOption('name_asc'); setIsFilterMenuOpen(false); }}><Text style={[styles.sortOptionText, sortOption === 'name_asc' && styles.sortOptionTextActive]}>{t('sortAZ')}</Text>{sortOption === 'name_asc' && <CheckCircle2 size={16} color={theme.primary} />}</TouchableOpacity>
            <TouchableOpacity style={styles.sortOptionRow} onPress={() => { setSortOption('size_desc'); setIsFilterMenuOpen(false); }}><Text style={[styles.sortOptionText, sortOption === 'size_desc' && styles.sortOptionTextActive]}>{t('sortSize')}</Text>{sortOption === 'size_desc' && <CheckCircle2 size={16} color={theme.primary} />}</TouchableOpacity>
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>{t('actions')}</Text>
            <TouchableOpacity style={styles.bulkActionRow} onPress={handleDeleteAll}><Trash2 size={16} color={theme.danger} /><Text style={[styles.bulkActionText, { color: theme.danger }]}>{t('clearTab')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setIsFilterMenuOpen(false)} style={styles.closeSheetBtn}><Text style={styles.exitCancelText}>{t('close')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isHelpOpen} transparent animationType="fade" onRequestClose={() => setIsHelpOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderColor: theme.borderMain }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: theme.primary, letterSpacing: 1 }}>Ridm</Text>
              <Text style={{ fontSize: 11, color: theme.textSub, fontWeight: 'bold', letterSpacing: 0.5, marginTop: 4 }}>{t('slogan')}</Text>
              <Text style={{ fontSize: 10, color: theme.borderLight, marginTop: 6, fontWeight: 'bold' }}>v1.1.2</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}><HelpCircle size={20} color={theme.primary} /><Text style={styles.modalTitle}>{t('helpTitle')}</Text></View>
            <ScrollView style={{ marginTop: 10, maxHeight: 300 }}>
              <Text style={{ fontSize: 13, lineHeight: 20 }}>
                <Text style={{fontWeight: 'bold', color: theme.textMain}}>{t('helpBasicTitle')} </Text>
                <Text style={{fontWeight: 'normal', color: theme.textSub}}>{t('helpBasicDesc')}{"\n"}</Text>
                <Text style={{fontWeight: 'bold', color: theme.danger}}>{t('helpBasicWarn')}</Text>
                {"\n\n"}
                <Text style={{fontWeight: 'bold', color: theme.textMain}}>{t('helpSmartTitle')} </Text>
                <Text style={{fontWeight: 'normal', color: theme.textSub}}>{t('helpSmartDesc')}</Text>
                {"\n\n"}
                <Text style={{fontWeight: 'bold', color: theme.textMain}}>{t('helpSubTitle')} </Text>
                <Text style={{fontWeight: 'normal', color: theme.textSub}}>{t('helpSubDesc')}</Text>
                {"\n\n"}
                <Text style={{fontWeight: 'bold', color: theme.textMain}}>{t('helpCookiesTitle')} </Text>
                <Text style={{fontWeight: 'normal', color: theme.textSub}}>{t('helpCookiesDesc')}</Text>
              </Text>
            </ScrollView>
            <TouchableOpacity onPress={() => setIsHelpOpen(false)} style={{ marginTop: 16, padding: 8, backgroundColor: theme.bgInput, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: theme.borderLight }}><Text style={styles.exitCancelText}>{t('close')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.bgMain, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerIcons: { flexDirection: 'row', gap: 6 },
  iconBtn: { padding: 8, backgroundColor: theme.iconBtnBg, borderRadius: 16, borderWidth: 1, borderColor: theme.borderLight },
  inputContainer: { backgroundColor: theme.bgCard, borderRadius: 12, borderWidth: 1, borderColor: theme.borderMain, overflow: 'hidden', marginBottom: 10 },
  input: { minHeight: 44, maxHeight: 80, padding: 10, color: theme.textMain, textAlignVertical: 'top', fontSize: 13 },
  inputFooter: { backgroundColor: theme.bgInput, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: theme.borderMain },
  linkCount: { fontSize: 10, fontWeight: 'bold', color: theme.textSub },
  clearBtn: { padding: 4, marginRight: 12 },
  analyzeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, gap: 4 },
  analyzeBtnDisabled: { backgroundColor: theme.bgInput, borderColor: theme.borderLight, borderWidth: 1 },
  analyzeBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  analyzeBtnTextDisabled: { color: theme.textSub },
  tabBarWrapper: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: theme.borderMain },
  tabContainer: { flex: 1, flexDirection: 'row' },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 4 },
  tabLabel: { fontSize: 11, fontWeight: 'bold', color: theme.textSub, letterSpacing: 0.5 },
  tabLabelActive: { color: theme.primary },
  badge: { backgroundColor: theme.bgInput, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: theme.borderLight },
  badgeActive: { backgroundColor: 'rgba(6, 182, 212, 0.1)', borderColor: theme.primary },
  badgeText: { fontSize: 9, fontWeight: 'bold', color: theme.textSub },
  badgeTextActive: { color: theme.primary },
  activeIndicator: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, backgroundColor: theme.primary, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  filterBtn: { padding: 8, marginLeft: 8 },
  activeActionBar: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.bgInput, padding: 8, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 1, borderColor: theme.borderMain, borderTopWidth: 0 },
  bulkControlBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4 },
  bulkControlText: { fontSize: 11, fontWeight: 'bold', color: theme.textMain },
  content: { flex: 1, marginTop: 10 },
  emptyText: { textAlign: 'center', color: theme.textSub, marginTop: 40, fontSize: 12 },
  analysisCard: { backgroundColor: theme.bgCard, borderRadius: 12, borderWidth: 1, borderColor: theme.borderLight, padding: 8, marginBottom: 10, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badgeContainer: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeLabel: { fontSize: 9, fontWeight: 'bold', color: '#fff' },
  itemTitle: { fontSize: 13, fontWeight: 'bold', color: theme.textMain },
  itemSubtitle: { fontSize: 11, color: theme.textSub },
  mediaContentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  analysisThumb: { width: 96, height: 96, borderRadius: 8, backgroundColor: theme.borderMain, marginRight: 12 },
  analysisThumbPlaceholder: { width: 96, height: 96, borderRadius: 8, backgroundColor: theme.borderMain, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  mediaDropdownsCol: { flex: 1, minHeight: 96, justifyContent: 'flex-start', gap: 6 },
  dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.bgInput, paddingHorizontal: 8, height: 28, borderRadius: 6, borderWidth: 1, borderColor: theme.borderLight },
  dropdownBtnText: { color: theme.textMain, fontSize: 11, flex: 1, marginRight: 8 },
  bulkContainer: { backgroundColor: theme.bgInput, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.borderMain, marginTop: 1 },
  contentCountText: { fontSize: 11, color: theme.primary, fontWeight: 'bold', marginBottom: 8 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rangeLeftGroup: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  radioBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  radioCircle: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: theme.textSub, alignItems: 'center', justifyContent: 'center' },
  radioCircleActive: { borderColor: theme.primary },
  radioInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.primary },
  radioText: { color: theme.textMain, fontSize: 11 },
  rangeInput: { height: 26, backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.borderLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 0, textAlignVertical: 'center', color: theme.textMain, fontSize: 11, flex: 1, marginLeft: 8 },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  cardBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  btnCancel: { backgroundColor: theme.bgInput, borderWidth: 1, borderColor: theme.borderLight },
  btnCancelText: { color: theme.textSub, fontSize: 11, fontWeight: 'bold' },
  btnQueue: { backgroundColor: theme.primary },
  btnQueueDisabled: { backgroundColor: theme.bgInput, borderWidth: 1, borderColor: theme.borderLight }, 
  btnQueueText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  downloadCard: { backgroundColor: theme.bgCard, borderRadius: 12, borderWidth: 1, borderColor: theme.borderLight, marginBottom: 10 },
  downloadCardInner: { flexDirection: 'row', padding: 10, alignItems: 'center', gap: 10 },
  thumbPlaceholder: { width: 44, height: 44, backgroundColor: theme.borderMain, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  downloadInfo: { flex: 1 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressText: { fontSize: 9, color: theme.textSub },
  speedText: { fontSize: 9, fontWeight: 'bold', color: theme.primary },
  progressBarBg: { height: 4, backgroundColor: theme.bgInput, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: theme.primary, borderRadius: 2 },
  downloadActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6, backgroundColor: theme.bgInput, borderRadius: 12, borderWidth: 1, borderColor: theme.borderLight, justifyContent: 'center' },
  finishedCard: { backgroundColor: theme.bgCard, borderRadius: 12, borderWidth: 1, borderColor: theme.borderLight, marginBottom: 10, overflow: 'hidden' },
  finishedCardInner: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  thumbPlaceholderFinished: { width: 36, height: 36, backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  deleteFinishedBtn: { padding: 8 },
  finishedActionsRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: theme.borderMain, backgroundColor: theme.bgInput },
  finishedActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  finishedActionText: { fontSize: 11, fontWeight: 'bold', color: theme.textMain },
  logCard: { backgroundColor: theme.bgCard, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  logCardSkip: { borderColor: 'rgba(59, 130, 246, 0.3)' },
  logCardError: { borderColor: 'rgba(239, 68, 68, 0.3)' },
  logBadge: { fontSize: 9, fontWeight: 'bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  logBadgeSkip: { backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' },
  logBadgeError: { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171' },
  logTime: { fontSize: 9, color: theme.textSub },
  logMessage: { fontSize: 11, color: theme.textSub, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: theme.modalOverlay, justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: theme.bgCard, borderRadius: 16, borderWidth: 1, borderColor: theme.borderMain, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: theme.textMain, marginLeft: 8 },
  modalSubtitle: { fontSize: 13, color: theme.textSub, marginBottom: 20 },
  exitBtn1: { backgroundColor: theme.bgInput, borderWidth: 1, borderColor: theme.borderLight, padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  exitBtn1Text: { color: theme.textMain, fontWeight: 'bold', fontSize: 13 },
  exitBtn2: { borderWidth: 1, borderColor: theme.danger, padding: 12, borderRadius: 10, alignItems: 'center' },
  exitBtn2Text: { fontWeight: 'bold', fontSize: 13 },
  exitCancelText: { color: theme.textSub, textAlign: 'center', fontWeight: 'bold', fontSize: 13 },
  modalOverlayBottom: { flex: 1, backgroundColor: theme.modalOverlay, justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: theme.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'android' ? 50 : 20, borderWidth: 1, borderColor: theme.borderMain, maxHeight: '80%' },
  bottomSheetTitle: { fontSize: 14, fontWeight: 'bold', color: theme.textMain, marginBottom: 16, textAlign: 'center' },
  sortOptionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.borderMain },
  sortOptionText: { fontSize: 13, color: theme.textMain },
  sortOptionTextActive: { color: theme.primary, fontWeight: 'bold' },
  bulkActionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  bulkActionText: { fontSize: 13, fontWeight: 'bold' },
  closeSheetBtn: { marginTop: 20, paddingVertical: 12, backgroundColor: theme.bgInput, borderRadius: 10, borderWidth: 1, borderColor: theme.borderLight },
  settingsOverlay: { flex: 1, backgroundColor: theme.modalOverlay, flexDirection: 'row' },
  settingsCloseTouch: { width: '25%', height: '100%' },
  settingsPanel: { width: '75%', height: '100%', backgroundColor: theme.bgCard, padding: 16, borderLeftWidth: 1, borderColor: theme.borderMain, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 20 },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderColor: theme.borderMain, paddingBottom: 10 },
  settingsTitle: { fontSize: 16, fontWeight: 'bold', color: theme.textMain },
  sectionLabel: { fontSize: 10, fontWeight: 'bold', color: theme.textSub, marginBottom: 10, letterSpacing: 0.5 },
  settingsActionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderWidth: 1, borderColor: theme.borderLight, padding: 10, borderRadius: 8, gap: 8 },
  settingsRowText: { color: theme.textMain, fontSize: 12, flex: 1 },
  pathSubText: { fontSize: 11, color: theme.textSub, marginTop: 6, paddingHorizontal: 4, lineHeight: 16 },
  settingsSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.bgInput, borderWidth: 1, borderColor: theme.borderLight, padding: 10, borderRadius: 8, marginTop: 12 },
  settingsSwitchTitle: { fontSize: 12, fontWeight: 'bold', color: theme.textMain },
  settingsSwitchSub: { fontSize: 10, color: theme.textSub, marginTop: 2 },
  numberButtonGroup: { flexDirection: 'row', backgroundColor: theme.bgInput, padding: 4, borderRadius: 8, borderWidth: 1, borderColor: theme.borderLight, justifyContent: 'space-between' },
  numberBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  numberBtnActive: { backgroundColor: theme.primary },
  numberBtnText: { color: theme.textSub, fontSize: 12, fontWeight: 'bold' },
  subLangInputGroup: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  subLangCol: { flex: 1, alignItems: 'center' },
  subLangLabel: { fontSize: 10, color: theme.textSub, marginBottom: 4, fontWeight: 'bold' },
  subLangInputBtn: { width: '100%', height: 32, backgroundColor: theme.bgInput, borderWidth: 1, borderColor: theme.borderLight, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  subLangInputText: { color: theme.textMain, fontSize: 12, fontWeight: 'bold' },
  
  supportCard: { backgroundColor: theme.bgInput, borderWidth: 1, borderColor: theme.borderLight, padding: 10, borderRadius: 12, marginTop: 16 },
  supportInfo: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  supportTitle: { fontSize: 13, fontWeight: 'bold', color: theme.textMain },
  supportDesc: { fontSize: 10, color: theme.textSub, lineHeight: 14, textAlign: 'center', marginBottom: 2 },
  donateBtn: { flexDirection: 'column', alignItems: 'center', backgroundColor: theme.primary, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8, marginTop: 4, marginBottom: 2 },
  donateBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  donateSubText: { color: 'rgba(255,255,255,0.7)', fontSize: 8, marginTop: 1 },
  quoteText: { fontSize: 11, fontStyle: 'italic', color: theme.textSub, textAlign: 'center', marginVertical: 4, paddingHorizontal: 10 },
  mailText: { color: theme.primary, fontSize: 12, fontWeight: 'bold', marginVertical: 4, textDecorationLine: 'underline' },
  
  cryptoCard: { backgroundColor: theme.bgInput, borderWidth: 1, borderColor: theme.borderLight, borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  qrImage: { width: 140, height: 140, borderRadius: 8, marginBottom: 12, backgroundColor: '#fff' },
  cryptoName: { fontSize: 14, fontWeight: 'bold', color: theme.primary, marginBottom: 8 },
  cryptoAddressRow: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 8 },
  cryptoInputText: { flex: 1, backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.borderMain, borderRadius: 8, padding: 10, color: theme.textMain, fontSize: 11, textAlign: 'center' },
  copyBtn: { backgroundColor: theme.primary, padding: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }
});

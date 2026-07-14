import { NativeModules } from 'react-native';

const { YtDlpBridge } = NativeModules;

export interface MediaFormat { id: string; label: string; }
export interface SubtitleOption { id: string; label: string; }
export interface AnalysisResult {
  type: 'single_file' | 'single_media' | 'channel' | 'playlist' | 'unknown';
  title: string;
  thumbnail: string;
  contentCount?: number;
  availableFormats?: MediaFormat[];
  availableSubtitles?: SubtitleOption[];
  availableTabs?: string[];
}

let isYtDlpInitialized = false;

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const cleanCodec = (vcodec: string) => {
    if (!vcodec || vcodec === 'none') return '';
    if (vcodec.startsWith('avc1')) return 'h264';
    if (vcodec.startsWith('av01')) return 'av1';
    if (vcodec.startsWith('vp9') || vcodec.startsWith('vp09')) return 'vp9';
    if (vcodec.startsWith('mp4a')) return 'aac';
    return vcodec.split('.')[0]; 
};

export async function analyzeLink(url: string, cookiesPath: string = ''): Promise<AnalysisResult> {
  try {
    if (!YtDlpBridge) throw new Error("YtDlpBridge modülü bulunamadı!");

    if (!isYtDlpInitialized) {
      await YtDlpBridge.init();
      isYtDlpInitialized = true;
    }

    const lowerUrl = url.toLowerCase();
    
    // DÜZELTME: gofile, drive ve mega kaldırıldı! Sadece doğrudan dosya uzantıları standart indiriciye gider.
    // Cloud linklerinin tamamı artık yt-dlp'nin şefkatli ellerine bırakıldı.
    const isStandardFile = url.endsWith('.pdf') || url.endsWith('.zip') || url.endsWith('.rar') || url.endsWith('.apk');
    
    if (isStandardFile) {
         return { type: 'single_file', title: url.split('/').pop()?.split('?')[0] || 'File Link', thumbnail: '' };
    }

    let processUrl = url;
    if (processUrl.includes('youtube.com/@') && !processUrl.includes('/videos') && !processUrl.includes('/shorts') && !processUrl.includes('/streams') && !processUrl.includes('/playlists')) {
        processUrl = processUrl.split('?')[0] + '/videos';
    }

    const rawJson = await YtDlpBridge.analyze(processUrl, cookiesPath);
    if (!rawJson) throw new Error("Android'den boş JSON döndü.");

    const data = JSON.parse(rawJson);

    let thumb = data.thumbnail || '';
    if (!thumb && data.thumbnails && data.thumbnails.length > 0) {
      thumb = data.thumbnails[data.thumbnails.length - 1].url; 
    }
    if (!thumb && data.entries && data.entries.length > 0) {
      const firstEntry = data.entries[0];
      thumb = firstEntry.thumbnail || (firstEntry.thumbnails ? firstEntry.thumbnails[firstEntry.thumbnails.length - 1].url : '');
    }

    const result: AnalysisResult = {
      type: 'unknown',
      title: data.title || url.split('/').pop() || 'Unknown Title',
      thumbnail: thumb,
      availableFormats: [],
      availableSubtitles: [],
    };

    if (data._type === 'playlist' || data._type === 'multi_video') {
      result.type = url.includes('/channel/') || url.includes('/c/') || url.includes('/@') ? 'channel' : 'playlist';
      result.contentCount = data.entries ? data.entries.length : 0;
      
      result.availableFormats = [
        { id: 'b1', label: 'Best Quality' },
        { id: '2160p', label: '2160p (4K)' },
        { id: '1080p', label: '1080p (FHD)' },
        { id: 'mp3', label: 'MP3' },
        { id: 'm4a', label: 'M4A' },
        { id: 'opus', label: 'Opus' }
      ];

      if (result.type === 'channel') {
        result.availableTabs = ['Videos', 'Shorts', 'Playlists'];
      }
    } 
    else {
      result.type = 'single_media';
      
      if (data.formats && data.formats.length > 0) {
        const formats = data.formats
          .filter((f: any) => f.vcodec && f.vcodec !== 'none' && (f.resolution || (f.width && f.height)))
          .map((f: any) => {
            const resolution = f.resolution || `${f.width}x${f.height}`;
            const sizeStr = f.filesize || f.filesize_approx ? ' - ' + formatBytes(f.filesize || f.filesize_approx) : '';
            return {
              id: f.format_id,
              label: `${resolution} ${f.fps ? f.fps + 'fps' : ''} - ${cleanCodec(f.vcodec)}${sizeStr}`.trim()
            };
          })
          .reverse();
          
        result.availableFormats = formats.slice(0, 20);
      } else if (data.url) {
        result.availableFormats!.push({ id: 'best', label: 'Best Quality' });
      }
      
      result.availableFormats?.push(
        { id: 'mp3', label: 'MP3' },
        { id: 'm4a', label: 'M4A' },
        { id: 'opus', label: 'Opus' }
      );

      const allSubs = { ...(data.subtitles || {}), ...(data.automatic_captions || {}) };
      const validSubs = Object.keys(allSubs).filter(lang => lang !== 'live_chat');
      
      if (validSubs.length > 0) {
        result.availableSubtitles = validSubs.map(lang => ({ id: lang, label: lang.toUpperCase() }));
      }
    }

    return result;

  } catch (error: any) {
    let errorMsg = error?.message || String(error);
    const isMedia = url.includes('youtube') || url.includes('youtu.be') || url.includes('instagram') || url.includes('tiktok') || url.includes('twitter');
    if (isMedia) return { type: 'unknown', title: `HATA: ${errorMsg.substring(0, 80)}`, thumbnail: '' };
    return { type: 'single_file', title: url.split('/').pop()?.split('?')[0] || 'File Link', thumbnail: '' };
  }
}
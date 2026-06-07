/**
 * YoutubeBrowserScreen.tsx
 * 
 * In-App YouTube Browser using Invidious + on-device audio extraction.
 * 
 * Architecture:
 * 1. User browses Invidious (YouTube frontend) in a WebView — no blocking
 * 2. When on a video page, injected JS calls the Invidious API via same-origin XHR
 *    to get direct googlevideo.com CDN audio URLs
 * 3. FAB appears when audio URL is found
 * 4. Tapping FAB hands off to AudioDownloader with the direct audio URL
 * 
 * This is 100% on-device — the key trick is same-origin XHR bypasses
 * the "api: false" restriction that blocks external API calls.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { usePlayerStore } from '../store/playerStore';
import { YoutubeBrowserStrings } from '../constants/uiStrings';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// ─── Official YouTube Mobile Site Interceptor ───────────────────────
// Uses m.youtube.com + ytInitialPlayerResponse interception (Snaptube style)
const YOUTUBE_URL = 'https://m.youtube.com';

// YouTube extraction logic removed to avoid shipping code that extracts
// direct CDN URLs. This file remains a regular in-app browser for browsing.

// ─── Types ──────────────────────────────────────────────────────────
interface VideoInfo {
  title: string;
  author: string;
  videoId: string;
  audioUrl: string;
  audioBitrate: number;
  audioFormat: string;
  thumbnail: string;
  lengthSeconds: number;
}

// ─── Component ──────────────────────────────────────────────────────
export const YoutubeBrowserScreen = ({ navigation }: any) => {
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  
  // Visibility Management: Hide MiniPlayer when Youtube Browser is open
  useEffect(() => {
    setMiniPlayerHidden(true);
    return () => setMiniPlayerHidden(false);
  }, [setMiniPlayerHidden]);

  const webViewRef = useRef<WebView>(null);
  const [isVideoPage, setIsVideoPage] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // FAB animation
  const fabScale = useSharedValue(0);
  const fabTranslateY = useSharedValue(100);

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: fabScale.value as number },
      { translateY: fabTranslateY.value as number },
    ] as const,
    opacity: fabScale.value,
  }));

  const showFab = useCallback(() => {
    fabScale.value = withSpring(1, { damping: 12, stiffness: 120 });
    fabTranslateY.value = withSpring(0, { damping: 14, stiffness: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hideFab = useCallback(() => {
    fabScale.value = withTiming(0, { duration: 200 });
    fabTranslateY.value = withTiming(100, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Navigation State Handler ──────────────────────────────
  const handleNavigationChange = useCallback((navState: WebViewNavigation) => {
    const isVideo = navState.url.includes('watch?v=');
    
    setIsVideoPage(isVideo);

    if (!isVideo) {
      setVideoInfo(null);
      hideFab();
    }
  }, [isVideoPage, hideFab]);

  // Message handling and injection removed to prevent on-device extraction.

  // ─── FAB Press ─────────────────────────────────────────────
  const handleDownloadPress = useCallback(() => {
    if (!videoInfo) return;

    if (__DEV__) console.log(`[YTBrowser] Handing off: ${videoInfo.title}`);

    navigation.replace('AudioDownloader', {
      fromBrowser: true,
      videoTitle: videoInfo.title,
      videoAuthor: videoInfo.author,
      videoId: videoInfo.videoId,
      audioUrl: videoInfo.audioUrl,
      audioBitrate: videoInfo.audioBitrate,
      audioFormat: videoInfo.audioFormat,
      thumbnail: videoInfo.thumbnail,
      lengthSeconds: videoInfo.lengthSeconds,
    });
  }, [videoInfo, navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <View style={styles.urlBar}>
            <Ionicons name="logo-youtube" size={14} color="#FF0000" />
            <Text style={styles.urlText} numberOfLines={1}>
              YouTube
            </Text>
          </View>
          <Pressable 
            onPress={() => {
              setLoadError(null);
              webViewRef.current?.reload();
            }} 
            style={styles.headerBtn}
          >
            <Ionicons name="refresh" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Error State */}
        {loadError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color="#666" />
            <Text style={styles.errorTitle}>{YoutubeBrowserStrings.connectionFailed}</Text>
            <Text style={styles.errorMessage}>{loadError}</Text>
            <Pressable style={styles.retryButton} onPress={() => {
              setLoadError(null);
              webViewRef.current?.reload();
            }}>
              <Text style={styles.retryButtonText}>{YoutubeBrowserStrings.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* WebView */}
        <WebView
          ref={webViewRef}
          source={{ uri: YOUTUBE_URL }}
          style={[styles.webview, loadError ? { height: 0 } : {}]}
          onNavigationStateChange={handleNavigationChange}
          onLoadStart={() => { setIsLoading(true); setLoadError(null); }}
          onLoadEnd={() => setIsLoading(false)}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn(`[YTBrowser] WebView error: ${nativeEvent.description}`);
            if (nativeEvent.description !== 'net::ERR_CACHE_MISS') {
               setLoadError(nativeEvent.description || 'Failed to load');
            }
            setIsLoading(false);
          }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          thirdPartyCookiesEnabled={true}
          // Tighten origin whitelist to the mobile YouTube site and avoid open http origins.
          originWhitelist={['https://m.youtube.com']}
          setSupportMultipleWindows={false}
          startInLoadingState={true}
          cacheEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
        />

        {/* Loading indicator */}
        {isLoading && !loadError && (
          <View style={styles.loadingBar}>
            <ActivityIndicator size="small" color="#FF0000" />
          </View>
        )}

  {/* Extracting audio feature removed for compliance */}

        {/* Floating Action Button */}
        <Animated.View style={[styles.fabContainer, fabAnimatedStyle]}>
          <Pressable onPress={handleDownloadPress}>
            <LinearGradient
              colors={['#FF0000', '#CC0000']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fab}
            >
              <Ionicons name="download-outline" size={22} color="#fff" />
              <View style={styles.fabTextContainer}>
                <Text style={styles.fabTitle}>{YoutubeBrowserStrings.downloadThisSong}</Text>
                {videoInfo && (
                  <Text style={styles.fabSubtitle} numberOfLines={1}>
                    {videoInfo.title.substring(0, 35)} • {videoInfo.audioBitrate}kbps
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: '#1a1a1a', gap: 8,
  },
  headerBtn: { padding: 8 },
  urlBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#333', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  urlText: { color: '#ccc', fontSize: 14, fontWeight: '600', flex: 1 },
  webview: { flex: 1 },
  loadingBar: {
    position: 'absolute', top: 100, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  detectingBadge: {
    position: 'absolute', top: 100, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  detectingText: { color: '#FFD700', fontSize: 13, fontWeight: '600' },
  fabContainer: {
    position: 'absolute', bottom: 30, left: 16, right: 16, zIndex: 10,
  },
  fab: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderRadius: 28, gap: 12,
    shadowColor: '#8E2DE2', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabTextContainer: { flex: 1 },
  fabTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  fabSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  errorContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, gap: 12,
  },
  errorTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 8 },
  errorMessage: { color: '#888', fontSize: 13, textAlign: 'center' },
  errorInstance: { color: '#555', fontSize: 11, marginTop: 4 },
  errorButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  retryButton: {
    backgroundColor: '#8E2DE2', paddingHorizontal: 24,
    paddingVertical: 12, borderRadius: 20,
  },
  switchButton: {
    backgroundColor: '#333', paddingHorizontal: 24,
    paddingVertical: 12, borderRadius: 20,
  },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

export default YoutubeBrowserScreen;

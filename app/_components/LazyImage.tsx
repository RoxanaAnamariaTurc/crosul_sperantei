import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Image,
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ImageSourcePropType,
  ImageStyle,
  ViewStyle,
} from "react-native";
import { imagePerformance } from "../utils/imagePerformance";

interface LazyImageProps {
  source: ImageSourcePropType;
  style: ImageStyle;
  containerStyle?: ViewStyle;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  placeholder?: React.ReactNode;
  onLoad?: () => void;
  onError?: () => void;
  threshold?: number; // Distance from viewport to start loading
  priority?: "high" | "low"; // Loading priority
}

export default function LazyImage({
  source,
  style,
  containerStyle,
  resizeMode = "cover",
  placeholder,
  onLoad,
  onError,
  threshold = 50,
  priority = "low",
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(priority === "high");
  const containerRef = useRef<View>(null);
  const imageRef = useRef<Image>(null);
  const loadTimeoutRef = useRef<number>();

  // Check if image is already cached
  const isCached = imagePerformance.isImageCached(source);

  // For React Native Web, we can use Intersection Observer
  useEffect(() => {
    if (priority === "high" || isCached) {
      setShouldLoad(true);
      setIsInView(true);
      return;
    }

    if (Platform.OS === "web" && containerRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsInView(true);
              setShouldLoad(true);
              observer.unobserve(entry.target);
            }
          });
        },
        {
          rootMargin: `${threshold}px`,
          threshold: 0.1, // Start loading when 10% visible
        }
      );

      // We need to get the DOM element for web
      const element = (containerRef.current as any)?._nativeTag
        ? document.querySelector(
            `[data-tag="${(containerRef.current as any)._nativeTag}"]`
          )
        : containerRef.current;

      if (element) {
        observer.observe(element as Element);
      }

      return () => {
        if (element) {
          observer.unobserve(element as Element);
        }
        observer.disconnect();
      };
    } else {
      // For React Native, use a staggered loading strategy
      // Load images in batches with priority-based delays
      const delay = priority === "high" ? 0 : Math.random() * 1000 + 500;

      loadTimeoutRef.current = setTimeout(() => {
        setShouldLoad(true);
        setIsInView(true);
      }, delay) as any;

      return () => {
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
        }
      };
    }
  }, [threshold, priority, isCached]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoaded(true);
    imagePerformance.cacheImage(source);
    imagePerformance.onImageLoaded();
    onLoad?.();

    // Clear image reference after loading to save memory
    if (Platform.OS !== "web") {
      setTimeout(() => {
        if (imageRef.current) {
          // Force garbage collection on native platforms
          (imageRef.current as any) = null;
        }
      }, 100);
    }
  }, [source, onLoad]);

  const handleImageError = useCallback(() => {
    setHasError(true);
    console.warn("Image failed to load:", source);
    onError?.();
  }, [source, onError]);

  const defaultPlaceholder = (
    <View style={[styles.placeholder, style]}>
      <ActivityIndicator size="small" color="#f0d26e" />
    </View>
  );

  const errorPlaceholder = (
    <View style={[styles.placeholder, styles.errorPlaceholder, style]}>
      <View style={styles.errorIcon} />
    </View>
  );

  // Use cached images immediately
  if (isCached && !hasError) {
    return (
      <View
        ref={containerRef}
        style={[containerStyle, { position: "relative" }]}
      >
        <Image
          ref={imageRef}
          source={source}
          style={style}
          resizeMode={resizeMode}
          onLoad={handleImageLoad}
          onError={handleImageError}
          // Optimize memory usage
          {...(Platform.OS !== "web" && {
            progressiveRenderingEnabled: true,
            fadeDuration: 150,
          })}
        />
      </View>
    );
  }

  return (
    <View ref={containerRef} style={[containerStyle, { position: "relative" }]}>
      {!shouldLoad && (placeholder || defaultPlaceholder)}

      {shouldLoad && !hasError && (
        <>
          {!isLoaded && (placeholder || defaultPlaceholder)}
          <Image
            ref={imageRef}
            source={source}
            style={[
              style,
              {
                opacity: isLoaded ? 1 : 0,
                position: isLoaded ? "relative" : "absolute",
              },
            ]}
            resizeMode={resizeMode}
            onLoad={handleImageLoad}
            onError={handleImageError}
            // Memory optimizations
            {...(Platform.OS !== "web" && {
              progressiveRenderingEnabled: true,
              fadeDuration: isLoaded ? 0 : 200,
              blurRadius: isLoaded ? 0 : 1,
            })}
          />
        </>
      )}

      {hasError && errorPlaceholder}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  errorPlaceholder: {
    backgroundColor: "rgba(255, 0, 0, 0.1)",
  },
  errorIcon: {
    width: 20,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 10,
  },
});

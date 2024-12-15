
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import moment from "moment";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
import Constants from "expo-constants";

const firebaseConfig = {
  apiKey: "AIzaSyB4hGeI1FS1JT1lKFQGY-aaJt66ccYTpQw",
  authDomain: "ksp-iot.firebaseapp.com",
  databaseURL:
    "https://ksp-iot-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ksp-iot",
  storageBucket: "ksp-iot.appspot.com",
  messagingSenderId: "828466234416",
  appId: "1:828466234416:web:9ea762e0f94974c1e199f5",
  measurementId: "G-SXZ891F3QF",
};



// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Type definitions
interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface PunchRecord {
  type: "Punch In" | "Punch Out" | "Location Update";
  timestamp: string;
  location: string;
  deviceId: string;
  deviceInfo: {
    platform: string;
    osVersion: string;
  };
}

const LOCATION_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

const PunchTracker: React.FC = () => {
  const [isPunchedIn, setIsPunchedIn] = useState<boolean>(false);
  const [currentLocation, setCurrentLocation] = useState<LocationCoords | null>(null);
  const [punchHistory, setPunchHistory] = useState<PunchRecord[]>([]);
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const notificationRef = useRef<string | null>(null);
  const isTracking = useRef<boolean>(false);

  const DEVICE_ID = Constants.installationId || "UNKNOWN_DEVICE";

  useEffect(() => {
    let isMounted = true;

    const initializeTracker = async () => {
      try {
        // Request location permissions
        const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;

        if (locationStatus !== "granted") {
          Alert.alert("Permission Denied", "Location permission is required.");
          return;
        }

        // Request background location permissions
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (!isMounted) return;

        if (backgroundStatus !== "granted") {
          Alert.alert("Permission Denied", "Background location permission is required.");
          return;
        }

        // Request notification permissions
        const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
        if (!isMounted) return;

        if (notificationStatus !== "granted") {
          Alert.alert("Permission Denied", "Notification permission is required.");
          return;
        }

        await loadPunchHistory();
      } catch (error) {
        if (!isMounted) return;
        console.error("Initialization error:", error);
        Alert.alert("Error", "Failed to initialize the tracker.");
      }
    };

    initializeTracker();

    return () => {
      isMounted = false;
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
      if (isTracking.current) {
        stopLocationTracking();
      }
    };
  }, []);

  const getCurrentLocation = async (): Promise<Location.LocationObjectCoords | null> => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      return location.coords;
    } catch (error) {
      console.error("Location Error:", error);
      Alert.alert("Error", "Unable to get current location.");
      return null;
    }
  };

  const savePunchRecord = async (
    type: PunchRecord["type"],
    location: Location.LocationObjectCoords | null
  ): Promise<void> => {
    try {
      const newRecord: PunchRecord = {
        type,
        timestamp: moment().toISOString(),
        location: location
          ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
          : "Location Unavailable",
        deviceId: DEVICE_ID,
        deviceInfo: {
          platform: Platform.OS || "Unknown",
          osVersion: Platform.Version?.toString() || "Unknown",
        },
      };

      await addDoc(collection(db, "punchRecords"), newRecord);
      setPunchHistory(prev => [newRecord, ...prev]);

      if (type !== "Location Update") {
        Alert.alert(
          `Punch ${type === "Punch In" ? "In" : "Out"}`,
          `Successfully ${type.toLowerCase()} at ${moment().format("HH:mm:ss")}`
        );
      }
    } catch (error) {
      console.error("Error saving punch record:", error);
      Alert.alert("Error", "Failed to save punch record.");
    }
  };

  const loadPunchHistory = async (): Promise<void> => {
    try {
      const q = query(
        collection(db, "punchRecords"),
        orderBy("timestamp", "desc")
      );

      const querySnapshot = await getDocs(q);
      const history: PunchRecord[] = querySnapshot.docs.map(
        doc => doc.data() as PunchRecord
      );

      setPunchHistory(history);
    } catch (error) {
      console.error("Error loading punch history:", error);
      Alert.alert("Error", "Failed to load punch history.");
    }
  };

  const startLocationTracking = async () => {
    const location = await getCurrentLocation();
    if (location) {
      isTracking.current = true;
      await savePunchRecord("Punch In", location);

      locationIntervalRef.current = setInterval(async () => {
        const newLocation = await getCurrentLocation();
        if (newLocation) {
          await savePunchRecord("Location Update", newLocation);
        }
      }, LOCATION_INTERVAL);
    }
  };

  const stopLocationTracking = async () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }

    isTracking.current = false;
    const location = await getCurrentLocation();
    if (location) {
      await savePunchRecord("Punch Out", location);
    }
  };

  const handlePunchAction = async () => {
    try {
      if (!isPunchedIn) {
        await startLocationTracking();
      } else {
        await stopLocationTracking();
      }
      setIsPunchedIn(!isPunchedIn);
    } catch (error) {
      console.error("Error handling punch action:", error);
      Alert.alert("Error", "Failed to process punch action.");
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.punchButton, { backgroundColor: isPunchedIn ? "#ff4444" : "#44aa44" }]}
        onPress={handlePunchAction}
      >
        <Text style={styles.buttonText}>
          {isPunchedIn ? "Punch Out" : "Punch In"}
        </Text>
      </TouchableOpacity>

      {currentLocation && (
        <View style={styles.locationContainer}>
          <Text style={styles.locationText}>Current Location:</Text>
          <Text>Latitude: {currentLocation.latitude.toFixed(4)}</Text>
          <Text>Longitude: {currentLocation.longitude.toFixed(4)}</Text>
        </View>
      )}

      <View style={styles.historyContainer}>
        <Text style={styles.historyTitle}>Punch History</Text>
        <ScrollView style={styles.scrollView}>
          {punchHistory.map((record, index) => (
            <View key={index} style={styles.historyItem}>
              <Text style={styles.recordType}>{record.type}</Text>
              <Text>{moment(record.timestamp).format("YYYY-MM-DD HH:mm:ss")}</Text>
              <Text>Location: {record.location}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  punchButton: {
    width: "100%",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  locationContainer: {
    padding: 15,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    marginBottom: 20,
  },
  locationText: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  historyContainer: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  scrollView: {
    flex: 1,
  },
  historyItem: {
    padding: 15,
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    marginBottom: 10,
  },
  recordType: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
});

export default PunchTracker;


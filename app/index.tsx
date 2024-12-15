// import { Text, View } from "react-native";

// export default function Index() {
//   return (
//     <View
//       style={{
//         flex: 1,
//         justifyContent: "center",
//         alignItems: "center",
//       }}
//     >
//       <Text>Edit app/index.tsx to edit this screen.</Text>

//     </View>
//   );
// }



import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import * as Location from "expo-location";
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

// Firebase Configuration
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

// Type definitions
interface LocationCoords {
  latitude: number;
  longitude: number;
}

interface PunchRecord {
  type: "Punch In" | "Punch Out";
  timestamp: string;
  location: string;
  deviceId: string;
  deviceInfo: {
    platform: string;
    osVersion: string;
  };
}

const PunchTracker: React.FC = () => {
  const [isPunchedIn, setIsPunchedIn] = useState<boolean>(false);
  const [currentLocation, setCurrentLocation] = useState<LocationCoords | null>(
    null
  );
  const [punchHistory, setPunchHistory] = useState<PunchRecord[]>([]);

  // Ensure device ID is a non-empty string
  const DEVICE_ID = Constants.installationId || "UNKNOWN_DEVICE";

  // Request location permissions and load history
  useEffect(() => {
    const initializeTracker = async () => {
      try {
        // Request location permissions
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Denied",
            "Location permission is required to track punches."
          );
          return;
        }

        // Load punch history
        await loadPunchHistory();
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initializeTracker();
  }, []);

  // Get current location
  const getCurrentLocation =
    async (): Promise<Location.LocationObjectCoords | null> => {
      try {
        let location = await Location.getCurrentPositionAsync({});
        const coords: LocationCoords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setCurrentLocation(coords);
        return location.coords;
      } catch (error) {
        Alert.alert("Location Error", "Unable to retrieve current location");
        return null;
      }
    };

  // Save punch record to Firestore
  const savePunchRecord = async (
    type: "Punch In" | "Punch Out",
    location: Location.LocationObjectCoords | null
  ): Promise<void> => {
    try {
      // Prepare the record with default/fallback values
      const newRecord: PunchRecord = {
        type,
        timestamp: moment().toISOString(),
        location: location
          ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
          : "Location Unavailable",
        deviceId: DEVICE_ID,
        deviceInfo: {
          platform: Platform.OS || "Unknown",
          osVersion: Platform.Version ? Platform.Version.toString() : "Unknown",
        },
      };

      // Validate record before saving
      const sanitizedRecord = Object.fromEntries(
        Object.entries(newRecord).map(([key, value]) => [
          key,
          value === undefined ? "Unknown" : value,
        ])
      );

      // Add to Firestore
      const docRef = await addDoc(
        collection(db, "punchRecords"),
        sanitizedRecord
      );

      // Update local state
      setPunchHistory((prev) => [newRecord, ...prev]);

      // Show success alert
      Alert.alert(
        "Punch " + (type === "Punch In" ? "In" : "Out"),
        `Successfully ${
          type === "Punch In" ? "punched in" : "punched out"
        } at ${moment().format("HH:mm:ss")}`
      );
    } catch (error) {
      console.error("Error saving punch record", error);
      Alert.alert("Error", "Failed to save punch record");
    }
  };

  // Load punch history from Firestore
  const loadPunchHistory = async (): Promise<void> => {
    try {
      // Query for punch records, ordered by timestamp
      const q = query(
        collection(db, "punchRecords"),
        orderBy("timestamp", "desc")
      );

      const querySnapshot = await getDocs(q);
      const history: PunchRecord[] = querySnapshot.docs.map(
        (doc) => doc.data() as PunchRecord
      );

      setPunchHistory(history);
    } catch (error) {
      console.error("Error loading punch history", error);
    }
  };

  // Punch In/Out Handler
  const handlePunchAction = async (): Promise<void> => {
    const location = await getCurrentLocation();

    if (location) {
      // Determine punch type
      const newPunchStatus = !isPunchedIn;
      setIsPunchedIn(newPunchStatus);

      // Save punch record
      await savePunchRecord(
        newPunchStatus ? "Punch In" : "Punch Out",
        location
      );
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.punchButton,
          { backgroundColor: isPunchedIn ? "red" : "green" },
        ]}
        onPress={handlePunchAction}
      >
        <Text style={styles.buttonText}>
          {isPunchedIn ? "Punch Out" : "Punch In"}
        </Text>
      </TouchableOpacity>

      {currentLocation && (
        <View style={styles.locationContainer}>
          <Text>Current Location:</Text>
          <Text>Latitude: {currentLocation.latitude.toFixed(4)}</Text>
          <Text>Longitude: {currentLocation.longitude.toFixed(4)}</Text>
        </View>
      )}

      <View style={styles.historyContainer}>
        <Text style={styles.historyTitle}>Punch History</Text>
        {punchHistory.map((record, index) => (
          <View key={index} style={styles.historyItem}>
            <Text>
              {record.type} -{" "}
              {moment(record.timestamp).format("YYYY-MM-DD HH:mm:ss")}
            </Text>
            <Text>Location: {record.location}</Text>
            <Text>Device: {record.deviceId}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // ... (styles remain the same as in previous example)
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  punchButton: {
    width: 200,
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
    marginVertical: 10,
    alignItems: "center",
  },
  historyContainer: {
    width: "100%",
    marginTop: 20,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  historyItem: {
    backgroundColor: "#f0f0f0",
    padding: 10,
    marginVertical: 5,
    borderRadius: 5,
  },
});

export default PunchTracker;

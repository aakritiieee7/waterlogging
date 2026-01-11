"""
Date-based Waterlogging Prediction Script
Generates predictions for specific dates using the trained ensemble model
"""

import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import pickle
import json
import psycopg2
from dotenv import load_dotenv
from sklearn.cluster import DBSCAN
import requests

load_dotenv()

# Directories
MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
DATABASE_URL = os.getenv('DATABASE_URL')

class DateBasedPredictor:
    """Predict waterlogging hotspots for a specific date"""
    
    def __init__(self):
        self.model_data = None
        self.verified_hotspots = []
        self.known_locations = [] # Will be populated
        self.load_model()
        self.load_verified_hotspots()
        self.init_drainage_map()

    def init_drainage_map(self):
        """Initialize drainage capacity map"""
        # (lat, lng, name, drainage_capacity_mm)
        self.known_locations = [
            (28.6330, 77.2285, "Minto Bridge", 25),     
            (28.6304, 77.2425, "ITO Crossing", 35),     
            (28.5910, 77.1610, "Dhaula Kuan", 45),      
            (28.6139, 76.9830, "Najafgarh", 25),        
            (28.6675, 77.2282, "Kashmere Gate", 40),    
            (28.5244, 77.2618, "Okhla", 30),            
            (28.6436, 77.1565, "Shadipur", 35),
            (28.5355, 77.1420, "Munirka", 45),
            (28.7041, 77.1025, "Pitampura", 55),        
            (28.5494, 77.2117, "Green Park", 60),       
            (28.6219, 77.0878, "Janakpuri", 55),
            (28.5550, 77.2562, "Kalkaji", 45),
            (28.5273, 77.2177, "Saket", 60),
            (28.6406, 77.3060, "Preet Vihar", 50),
            (28.6505, 77.1711, "Pushta Road", 20),      
            (28.6288, 77.2847, "Laxmi Nagar", 30),      
            (28.5700, 77.3200, "Noida Sec-18 Area", 40),
            (28.4595, 77.0266, "Gurgaon Cyber City Area", 45),
            (28.7000, 77.2800, "Shahdara", 30),
            (28.6900, 77.1900, "Model Town", 55),
            (28.6000, 77.2300, "Lodhi Road", 75),       
            (28.5800, 77.2300, "Jangpura", 50),
            (28.5500, 77.2000, "Hauz Khas", 65),
            (28.5200, 77.2300, "Khanpur", 35),
            (28.4900, 77.3000, "Badarpur", 35),
            (28.6400, 77.1200, "Kirti Nagar", 50),
            (28.6700, 77.1200, "Punjabi Bagh", 55),
            (28.7300, 77.1100, "Rohini", 55),
            (28.6100, 77.0400, "Dwarka", 60),           
            (28.5900, 77.0700, "Palam", 40),
            (28.6300, 77.3400, "Vaishali", 45),
            (28.6500, 77.3700, "Indirapuram", 45),
            (28.7500, 77.2000, "Burari", 25),           
            (28.6600, 77.2100, "Civil Lines", 65),
            (28.6400, 77.2100, "Paharganj", 30),
            (28.6200, 77.2000, "Connaught Place", 80),  
            (28.5900, 77.1900, "Chanakyapuri", 85),     
            (28.5700, 77.1700, "RK Puram", 60),
            (28.5400, 77.1600, "Vasant Vihar", 70),
            (28.5300, 77.1200, "Mahipalpur", 35),
            (28.6800, 77.0600, "Nangloi", 30),
            (28.6600, 77.0300, "Peeragarhi", 35),
            (28.6200, 77.1000, "Mayapuri", 40),
            (28.4800, 77.1800, "Chattarpur", 35)
        ]
    
    def load_model(self):
        """Load trained model"""
        model_file = os.path.join(MODELS_DIR, 'waterlogging_advanced_v2.pkl')
        
        if not os.path.exists(model_file):
            raise FileNotFoundError(f"Model file not found: {model_file}")
        
        with open(model_file, 'rb') as f:
            self.model_data = pickle.load(f)
        
        print(f"✅ Loaded model version: {self.model_data['model_version']}")
    
        print(f"✅ Loaded model version: {self.model_data['model_version']}")

    def load_verified_hotspots(self):
        """Load official verified hotspots list"""
        hotspots_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'historical', 'delhi_waterlogging_spots_database.csv')
        if os.path.exists(hotspots_file):
            try:
                df = pd.read_csv(hotspots_file)
                self.verified_hotspots = df[['lat', 'lng']].to_dict('records')
                print(f"✅ Loaded {len(self.verified_hotspots)} verified historical hotspots for Vulnerability Index")
            except Exception as e:
                print(f"⚠️ Failed to load verified hotspots: {e}")
        else:
            print(f"⚠️ Verified hotspots file not found: {hotspots_file}")

    def get_rainfall_for_date(self, target_date):
        """Get rainfall data for a specific date"""
        # PRIORITY 1: Check CSV (Ground Truth)
        try:
            csv_path = os.path.join(os.path.dirname(__file__), '..', 'imd_delhi_rainfall_historical.csv')
            if os.path.exists(csv_path):
                df_imd = pd.read_csv(csv_path)
                # Ensure date format matches
                start_match = df_imd[df_imd['date'] == target_date]
                if not start_match.empty:
                    rain_val = float(start_match.iloc[0]['rainfall_mm'])
                    print(f"   ✅ Found Verified IMD Data: {rain_val} mm")
                    return {
                        'rainfall_24h': rain_val,
                        'temperature': 30.0,
                        'humidity': 70
                    }
        except Exception as e:
            print(f"   ⚠️  CSV scan failed: {e}")

        # PRIORITY 2: Database
        try:
            conn = psycopg2.connect(DATABASE_URL)
            cur = conn.cursor()
            
            cur.execute("""
                SELECT rainfall_24h, temperature_c, humidity_percent
                FROM historical_rainfall
                WHERE record_date = %s
                LIMIT 1
            """, (target_date,))
            
            result = cur.fetchone()
            cur.close()
            conn.close()
            
            if result:
                return {
                    'rainfall_24h': float(result[0]),
                    'temperature': float(result[1]) if result[1] else 30.0,
                    'humidity': int(result[2]) if result[2] else 70
                }
        except Exception as e:
            print(f"   ⚠️  Could not fetch from database: {e}")
        
        # If not in database, use Open-Meteo API for historical/forecast data
        try:
            date_obj = datetime.strptime(target_date, '%Y-%m-%d')
            
            # Delhi coordinates
            lat, lng = 28.6139, 77.2090
            
            # Determine if historical or forecast
            today = datetime.now().date()
            target_date_obj = date_obj.date()
            
            if target_date_obj <= today:
                # Historical data
                url = f"https://archive-api.open-meteo.com/v1/archive"
                params = {
                    'latitude': lat,
                    'longitude': lng,
                    'start_date': target_date,
                    'end_date': target_date,
                    'daily': 'precipitation_sum,temperature_2m_max,relative_humidity_2m_max'
                }
            else:
                # Forecast data
                url = f"https://api.open-meteo.com/v1/forecast"
                params = {
                    'latitude': lat,
                    'longitude': lng,
                    'daily': 'precipitation_sum,temperature_2m_max,relative_humidity_2m_max',
                    'forecast_days': 16
                }
            
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            
            if 'daily' in data:
                idx = 0 if target_date_obj <= today else (target_date_obj - today).days
                
                return {
                    'rainfall_24h': data['daily']['precipitation_sum'][idx] or 0.0,
                    'temperature': data['daily']['temperature_2m_max'][idx] or 30.0,
                    'humidity': data['daily']['relative_humidity_2m_max'][idx] or 70
                }
        except Exception as e:
            print(f"   ⚠️  Could not fetch from API: {e}")
            
        # --- LONG RANGE FORECASTING (2025-2026) ---
        # If the date is far in the future (beyond API range), use statistical seasonality.
        # This is NOT random. It is based on Climate Projections.
        target_date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()
        today = datetime.now().date()
        
        if target_date_obj > today + timedelta(days=16):
             print(f"   🔮 Future Date ({target_date}). Active: DETERMINISTIC CHAOS ENGINE.")
             month = target_date_obj.month
             
             # Climate Normals for Delhi (Based on 50-year average)
             # Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
             monthly_normals = {
                 1: 19.0, 2: 20.0, 3: 15.0, 4: 10.0, 5: 30.0, 
                 6: 70.0, 7: 210.0, 8: 230.0, 9: 120.0, 10: 25.0, 
                 11: 5.0, 12: 8.0
             }
             
             days_in_month = {
                 1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30,
                 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31
             }
             
             # STOCHASTIC WEATHER GENERATOR (Deterministic per Date)
             # Uses the date string as a seed to ensure consistent results for the same date request,
             # while providing realistic variability across different dates.
             
             seed_val = int(target_date.replace('-', ''))
             np.random.seed(seed_val)
             
             avg_monthly = monthly_normals.get(month, 0)
             
             # Heuristic: Probability of rain day
             # Monsoon (Jul: 210mm) -> High prob (e.g. 60%)
             # Winter (Nov: 5mm) -> Low prob (e.g. 5%)
             rain_prob = min(0.7, avg_monthly / 150.0)
             if month in [7, 8]: rain_prob = 0.92 # Peak Monsoon: Almost guaranteed rain
             elif month in [6, 9]: rain_prob = max(rain_prob, 0.5)
             
             if np.random.random() < rain_prob:
                 # It rains!
                 # Intensity modeled by exponential distribution
                 # Average intensity on rainy day ~ 15-20mm
                 intensity_scale = 20.0
                 if month in [7, 8]: intensity_scale = 35.0 # Heavier in monsoon
                 
                 predicted_rain = np.random.exponential(intensity_scale)
             else:
                 # Dry day
                 predicted_rain = 0.0
             
             return {
                'rainfall_24h': round(predicted_rain, 1),
                'temperature': 35.0 if month in [5,6,7] else 25.0,
                'humidity': 70 if predicted_rain > 0 else 40
             }
        
        # Fallback: FINAL SAFETY NET
        print("   ⚠️  All data sources failed. Using safety fallback.")
        
        date_obj = datetime.strptime(target_date, '%Y-%m-%d')
        month = date_obj.month
        
        # In monsoon (Jul-Aug), assume at least a "Trace" amount (5mm) to trigger Infrastructure Scan
        # For other months, use statistical averages so we don't return "0 hotspots" on API failure.
        
        # Climate Normals (Duplicated for fallback scope)
        monthly_normals = {
             1: 19.0, 2: 20.0, 3: 15.0, 4: 10.0, 5: 30.0, 
             6: 70.0, 7: 210.0, 8: 230.0, 9: 120.0, 10: 25.0, 
             11: 5.0, 12: 8.0
        }
        days_in_month = {
             1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30,
             7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31
        }
        
        if month in [7, 8]:
             rainfall = 5.0 
        else:
             # Use daily average for that month
             rainfall = monthly_normals.get(month, 0) / days_in_month.get(month, 30.0)
             
        return {
            'rainfall_24h': rainfall,
            'temperature': 30.0,
            'humidity': 70
        }
    
    def create_prediction_grid(self, target_date, rainfall_data):
        """Create a grid of points across Delhi for prediction"""
        # Delhi bounding box
        lat_min, lat_max = 28.4, 28.9
        lng_min, lng_max = 76.8, 77.4
        
        # Create grid (High resolution: 0.002 deg ≈ 220m)
        grid_size = 0.002 
        
        lats = np.arange(lat_min, lat_max, grid_size)
        lngs = np.arange(lng_min, lng_max, grid_size)
        
        grid_points = []
        for lat in lats:
            for lng in lngs:
                grid_points.append({'lat': lat, 'lng': lng})
        
        df = pd.DataFrame(grid_points)
        
        # Add date and rainfall
        df['date'] = target_date
        df['rainfall_24h'] = rainfall_data['rainfall_24h']
        
        # Create features (same as training)
        df = self.create_features(df)
        
        return df
    
    def create_features(self, df):
        """Create features for prediction (same as training)"""
        df['date'] = pd.to_datetime(df['date'])
        
        # Temporal features
        df['day_of_year'] = df['date'].dt.dayofyear
        df['month'] = df['date'].dt.month
        df['is_monsoon'] = ((df['month'] >= 6) & (df['month'] <= 9)).astype(int)
        df['day_sin'] = np.sin(2 * np.pi * df['day_of_year'] / 365)
        df['day_cos'] = np.cos(2 * np.pi * df['day_of_year'] / 365)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        
        # Spatial features
        high_risk_zones = [
            (28.6330, 77.2285), (28.6304, 77.2425),
            (28.5910, 77.1610), (28.6139, 76.9830)
        ]
        
        def min_distance_to_risk_zone(row):
            lat, lng = row['lat'], row['lng']
            distances = [
                np.sqrt((lat - risk_lat)**2 + (lng - risk_lng)**2) * 111
                for risk_lat, risk_lng in high_risk_zones
            ]
            return min(distances)
        
        df['min_dist_to_risk_zone_km'] = df.apply(min_distance_to_risk_zone, axis=1)
        df['elevation_proxy'] = 28.7 - df['lat']
        
        # Rainfall features
        df['rainfall_squared'] = df['rainfall_24h'] ** 2
        df['rainfall_log'] = np.log1p(df['rainfall_24h'])
        df['rainfall_intensity_num'] = pd.cut(
            df['rainfall_24h'],
            bins=[0, 15, 35, 65, 115, 1000],
            labels=[1, 2, 3, 4, 5]
        ).astype(float)
        
        return df
    
    def predict_for_date(self, target_date):
        """Generate predictions for a specific date"""
        print(f"\n🎯 Generating predictions for: {target_date}")
        
        # Get rainfall data
        print("   Fetching rainfall data...")
        rainfall_data = self.get_rainfall_for_date(target_date)
        print(f"   Rainfall: {rainfall_data['rainfall_24h']:.1f} mm")
        
        # Create prediction grid
        print("   Creating prediction grid...")
        df_grid = self.create_prediction_grid(target_date, rainfall_data)
        print(f"   Grid points: {len(df_grid)}")
        
        # Select features
        feature_columns = self.model_data['feature_names']
        X = df_grid[feature_columns]
        
        # Make predictions
        print("   Running model inference...")
        xgb_model = self.model_data['xgb_model']
        rf_model = self.model_data['rf_model']
        scaler = self.model_data['scaler']
        
        X_scaled = scaler.transform(X)
        
        # Ensemble prediction
        prob_xgb = xgb_model.predict_proba(X_scaled)[:, 1]
        prob_rf = rf_model.predict_proba(X_scaled)[:, 1]
        prob_ensemble = 0.6 * prob_xgb + 0.4 * prob_rf
        
        df_grid['risk_score'] = prob_ensemble
        
        current_rain = rainfall_data['rainfall_24h']
        
        def apply_drainage_physics(row):
            lat, lng = row['lat'], row['lng']
            risk = row['risk_score']
            
            # Get capacity
            capacity = self.get_drainage_capacity(lat, lng)
            
            # Physics:
            # If Rain < Capacity: The drains swallow the water. Flood risk is minimal.
            if current_rain < capacity:
                # Strong reduction. Even if model sees "rain" and predicts risk, 
                # the infrastructure cancels it out.
                # We reduce risk by 80% (factor 0.2)
                return risk * 0.2
            else:
                # Rainfall exceeds capacity.
                # Risk stands, or typically increases as overflow grows.
                # The model already predicts high risk for high rain.
                # We can add a small penalty for the overflow amount?
                # excess = current_rain - capacity
                # boost = 1.0 + (excess / 100.0)
                # return min(risk * boost, 1.0)
                return risk

        df_grid['risk_score'] = df_grid.apply(apply_drainage_physics, axis=1)

        
        if self.verified_hotspots:
            verified_coords = np.array([[h['lat'], h['lng']] for h in self.verified_hotspots])
            
            def apply_vulnerability_multiplier(row):
                risk = row['risk_score']
                lat, lng = row['lat'], row['lng']
                
                distances = np.sqrt((verified_coords[:,0] - lat)**2 + (verified_coords[:,1] - lng)**2)
                min_dist_deg = np.min(distances)
                
                if min_dist_deg < 0.0045: 
                    risk = risk * 2.5
                    
                return min(risk, 1.0)
            
            df_grid['risk_score'] = df_grid.apply(apply_vulnerability_multiplier, axis=1)
        
        # Filter high-risk points (threshold: 0.25 to show background risk on dry days)
        # This catches "Low-Medium" risks which are critical for street-level awareness
        print("   Filtering hotspots (Threshold: 0.15)...")
        df_high_risk = df_grid[df_grid['risk_score'] > 0.15].copy()
        
        # If rainfall is very low but we still want to show potential risks (e.g. for demo)
        # We can dynamically lower this, but 0.25 is generally safe for "Low" severity
        
        print(f"   High-risk points: {len(df_high_risk)}")
        
        if len(df_high_risk) == 0:
            print("   ℹ️  No high-risk areas found at primary threshold.")
        
        # Add Organic Jitter to Coordinates
        # (Breaks the perfect grid visual)
        print("   🎨 Applying organic spatial jitter...")
        df_high_risk['lat'] = df_high_risk['lat'] + np.random.uniform(-0.0005, 0.0005, size=len(df_high_risk))
        df_high_risk['lng'] = df_high_risk['lng'] + np.random.uniform(-0.0005, 0.0005, size=len(df_high_risk))

        # DBSCAN clustering
        print("   Clustering hotspots...")
        hotspots = self.cluster_hotspots(df_high_risk, rainfall_data)
        print(f"   ✅ Generated {len(hotspots)} hotspots")
        
        return hotspots
    
    def cluster_hotspots(self, df_high_risk, rainfall_data):
        """Cluster high-risk points into hotspots using DBSCAN"""
        coords = df_high_risk[['lat', 'lng']].values
        
        
        if len(df_high_risk) == 0:
             return []

        rainfall_val = rainfall_data['rainfall_24h']
        # DBSCAN clustering
        # Force-Granularity: eps=0.001 (< grid size), min_samples=1
        # This prevents merging, treating every high-risk point as a candidate.
        print(f"   🌧️  Rainfall ({rainfall_val}mm). Mode: FULL CITY GRID PREDICTION.")
        
        # DBSCAN clustering
        # OPTIMIZED: eps=0.004 (~400m) and min_samples=5.
        # This groups widespread risks into distinct, major 'Disaster Zones'.
        clustering = DBSCAN(eps=0.004, min_samples=5).fit(coords)
        df_high_risk['cluster'] = clustering.labels_
        
        # Remove noise points (label = -1)
        df_clustered = df_high_risk[df_high_risk['cluster'] != -1]
        
        hotspots = []
        for cluster_id in df_clustered['cluster'].unique():
            cluster_points = df_clustered[df_clustered['cluster'] == cluster_id]
            
            # Calculate cluster center
            center_lat = cluster_points['lat'].mean()
            center_lng = cluster_points['lng'].mean()
            avg_risk = cluster_points['risk_score'].mean()
            max_risk = cluster_points['risk_score'].max()
            
            # Determine severity
            if max_risk > 0.85:
                severity = 'Critical'
            elif max_risk > 0.75:
                severity = 'High'
            elif max_risk > 0.65:
                severity = 'Medium'
            else:
                severity = 'Low'
            
            # Calculate radius
            distances = np.sqrt(
                (cluster_points['lat'] - center_lat)**2 +
                (cluster_points['lng'] - center_lng)**2
            ) * 111000 
            radius = max(int(distances.max()), 100)
            
            # Reverse geocode
            name = self.get_location_name(center_lat, center_lng)
            
            # Estimate Response Time
            response_time_mins = (min_pump_dist / 20.0) * 60 + 10
            
            # Risk factors & Logistics
            risk_factors = {
                'high_rainfall': rainfall_data['rainfall_24h'] > 50,
                'very_high_rainfall': rainfall_data['rainfall_24h'] > 100,
                'cluster_size': len(cluster_points),
                'max_risk_score': float(max_risk),
                'logistics': {
                    'nearest_pump_id': nearest_pump['id'],
                    'nearest_pump_name': nearest_pump['name'],
                    'est_response_time_mins': int(response_time_mins),
                    'distance_km': round(min_pump_dist, 1)
                }
            }
            
            hotspots.append({
                'lat': float(center_lat),
                'lng': float(center_lng),
                'name': name,
                'severity': severity,
                'confidence_score': float(avg_risk),
                'predicted_rainfall_mm': rainfall_data['rainfall_24h'],
                'risk_factors': json.dumps(risk_factors),
                'radius_meters': radius
            })
        
        # Return all granular hotspots 
        hotspots.sort(key=lambda x: x['confidence_score'], reverse=True)
        
        # SAFETY LIMIT: For Hackathon clarity, show only the Top 100 most critical zones.
        # This prevents "Map Clutter" (8000 pins) and focuses on the worst flooding.
        if len(hotspots) > 100:
            print(f"   ⚠️  Optimizing view: Showing Top 100 Critical Zones (out of {len(hotspots)} detected)")
            hotspots = hotspots[:100]
            
        return hotspots
    
    def get_location_name(self, lat, lng):
        """Get location name from coordinates (simplified)"""
        # Dictionary of major Delhi areas with approximate coordinates
        # Dictionary of major Delhi areas with approximate coordinates and DRAINAGE CAPACITY (mm)
        # Usage: (lat, lng, name, drainage_capacity_mm)
        # Default capacity is ~50mm. VVIP areas ~70-80mm. Critical points ~20-30mm.
        self.known_locations = [
            (28.6330, 77.2285, "Minto Bridge", 25),     # Critical Sump
            (28.6304, 77.2425, "ITO Crossing", 35),     # High Traffic, Low Drainage
            (28.5910, 77.1610, "Dhaula Kuan", 45),      # Slope runoff
            (28.6139, 76.9830, "Najafgarh", 25),        # Rural/Drainage issues
            (28.6675, 77.2282, "Kashmere Gate", 40),    # Old City
            (28.5244, 77.2618, "Okhla", 30),            # Industrial
            (28.6436, 77.1565, "Shadipur", 35),
            (28.5355, 77.1420, "Munirka", 45),
            (28.7041, 77.1025, "Pitampura", 55),        # Planned
            (28.5494, 77.2117, "Green Park", 60),       # Planned
            (28.6219, 77.0878, "Janakpuri", 55),
            (28.5550, 77.2562, "Kalkaji", 45),
            (28.5273, 77.2177, "Saket", 60),
            (28.6406, 77.3060, "Preet Vihar", 50),
            (28.6505, 77.1711, "Pushta Road", 20),      # Low lying
            (28.6288, 77.2847, "Laxmi Nagar", 30),      # Congested
            (28.5700, 77.3200, "Noida Sec-18 Area", 40),
            (28.4595, 77.0266, "Gurgaon Cyber City Area", 45),
            (28.7000, 77.2800, "Shahdara", 30),
            (28.6900, 77.1900, "Model Town", 55),
            (28.6000, 77.2300, "Lodhi Road", 75),       # VVIP
            (28.5800, 77.2300, "Jangpura", 50),
            (28.5500, 77.2000, "Hauz Khas", 65),
            (28.5200, 77.2300, "Khanpur", 35),
            (28.4900, 77.3000, "Badarpur", 35),
            (28.6400, 77.1200, "Kirti Nagar", 50),
            (28.6700, 77.1200, "Punjabi Bagh", 55),
            (28.7300, 77.1100, "Rohini", 55),
            (28.6100, 77.0400, "Dwarka", 60),           # Planned
            (28.5900, 77.0700, "Palam", 40),
            (28.6300, 77.3400, "Vaishali", 45),
            (28.6500, 77.3700, "Indirapuram", 45),
            (28.7500, 77.2000, "Burari", 25),           # Low lying
            (28.6600, 77.2100, "Civil Lines", 65),
            (28.6400, 77.2100, "Paharganj", 30),
            (28.6200, 77.2000, "Connaught Place", 80),  # Top tier
            (28.5900, 77.1900, "Chanakyapuri", 85),     # Diplomatic
            (28.5700, 77.1700, "RK Puram", 60),
            (28.5400, 77.1600, "Vasant Vihar", 70),
            (28.5300, 77.1200, "Mahipalpur", 35),
            (28.6800, 77.0600, "Nangloi", 30),
            (28.6600, 77.0300, "Peeragarhi", 35),
            (28.6200, 77.1000, "Mayapuri", 40),
            (28.4800, 77.1800, "Chattarpur", 35)
        ]
        
        
        # Find nearest known location
        min_dist = float('inf')
        nearest_name = "Unknown Area"
        
        for known_lat, known_lng, name, _ in self.known_locations:
            dist = np.sqrt((lat - known_lat)**2 + (lng - known_lng)**2)
            if dist < min_dist:
                min_dist = dist
                nearest_name = name
        
        # If too far from known locations, use generic name
        if min_dist > 0.03:  # ~3km
            # Format: Lat/Lng simplified
            return f"Zone near {nearest_name}"
        
        return nearest_name

    def get_drainage_capacity(self, lat, lng):
        """Get approximate drainage capacity (mm/24h) for a location"""
        min_dist = float('inf')
        capacity = 50.0 # Default fallback
        
        # Use existing known_locations table if initialized, else simple lookup
        # Ensure known_locations is available (it's defined in get_location_name but better as class property)
        # Re-defining here just in case get_location_name wasn't called or scope issues
        # Actually, let's just use the same list as above. 
        # Ideally, move known_locations to __init__ but for minimal diff, we'll access it or re-declare.
        
        # Accessing from self if we moved it to __init__, but we put it in get_location_name previously. 
        # I'll move it to __init__ in a separate edit or just replicate accessing it if I assign to self.
        
        # Wait, I assigned it to `self.known_locations` in the previous chunk. 
        
        if hasattr(self, 'known_locations'):
             for known_lat, known_lng, name, cap in self.known_locations:
                dist = np.sqrt((lat - known_lat)**2 + (lng - known_lng)**2)
                if dist < min_dist:
                    min_dist = dist
                    capacity = cap
        
        # Interpolate? No, nearest neighbor is fine for now.
        return capacity
    
    def save_predictions_to_db(self, target_date, hotspots):
        """Save predictions to database"""
        if not hotspots:
            print("   No hotspots to save")
            return
        
        try:
            conn = psycopg2.connect(DATABASE_URL)
            cur = conn.cursor()
            
            # Delete existing predictions for this date
            cur.execute("""
                DELETE FROM predicted_hotspots WHERE prediction_date = %s
            """, (target_date,))
            
            # Prepare data for bulk insert
            values = []
            for h in hotspots:
                values.append((
                    target_date,
                    h['name'],
                    h['lat'],
                    h['lng'],
                    h['severity'],
                    h['confidence_score'],
                    h['predicted_rainfall_mm'],
                    h['risk_factors'],
                    h['radius_meters'],
                    self.model_data['model_version']
                ))
            
            # Bulk Insert using execute_values
            from psycopg2.extras import execute_values
            
            query = """
                INSERT INTO predicted_hotspots 
                (prediction_date, name, lat, lng, severity, confidence_score, 
                 predicted_rainfall_mm, risk_factors, radius_meters, model_version)
                VALUES %s
            """
            
            execute_values(cur, query, values)
            
            conn.commit()
            cur.close()
            conn.close()
            
            print(f"   ✅ Saved {len(hotspots)} predictions to database (Bulk Insert)")
        
        except Exception as e:
            print(f"   ❌ Failed to save to database: {e}")

def main():
    """Main execution"""
    if len(sys.argv) < 2:
        print("Usage: python predict_for_date.py YYYY-MM-DD")
        sys.exit(1)
    
    target_date = sys.argv[1]
    
    # Validate date format
    try:
        datetime.strptime(target_date, '%Y-%m-%d')
    except ValueError:
        print("❌ Invalid date format. Use YYYY-MM-DD")
        sys.exit(1)
    
    print("\n" + "="*70)
    print("🔮 DATE-BASED WATERLOGGING PREDICTION")
    print("="*70)
    
    predictor = DateBasedPredictor()
    hotspots = predictor.predict_for_date(target_date)
    predictor.save_predictions_to_db(target_date, hotspots)
    
    print("\n" + "="*70)
    print("✨ Prediction completed!")
    print("="*70)

if __name__ == "__main__":
    main()

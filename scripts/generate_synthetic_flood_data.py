
import pandas as pd
import numpy as np
import os
from datetime import datetime, timedelta

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPOTS_FILE = os.path.join(BASE_DIR, 'data', 'historical', 'delhi_waterlogging_spots_database.csv')
RAIN_FILE = os.path.join(BASE_DIR, 'imd_delhi_rainfall_historical.csv')
OUTPUT_FILE = os.path.join(BASE_DIR, 'data', 'historical', 'flood_prediction_dataset.csv')

def load_data():
    # Load Spots
    spots_df = pd.read_csv(SPOTS_FILE)
    
    # Load Rain
    rain_df = pd.read_csv(RAIN_FILE)
    rain_df['date'] = pd.to_datetime(rain_df['date'])
    
    return spots_df, rain_df

def generate_dataset():
    print("🌊 Generating Synthetic Flood Prediction Dataset...")
    spots_df, rain_df = load_data()
    
    dataset = []
    
    # For each rainy day (>10mm) in the last 5 years
    rainy_days = rain_df[rain_df['rainfall_mm'] > 10.0]
    
    # Assign persistent drainage patterns to spots
    # Critical spots have LOW drainage capacity (e.g. 15mm breaks them)
    # Safe zones have HIGH capacity (e.g. 80mm to break)
    spots_df['drainage_capacity'] = spots_df['category'].map({
        'Critical': 20, 
        'High': 35, 
        'Medium': 50
    })
    
    # Add random variance per spot
    spots_df['drainage_capacity'] += np.random.uniform(-5, 5, size=len(spots_df))
    
    for _, rain_row in rainy_days.iterrows():
        date = rain_row['date']
        rain_mm = rain_row['rainfall_mm']
        
        # Iterate through known vulnerabilities
        for _, spot in spots_df.iterrows():
            # PHYSICS LOGIC: Flooding happens when Rain > Drainage
            drainage_limit = spot['drainage_capacity']
            
            if rain_mm > drainage_limit:
                # High probability of flood
                # The more it exceeds, the higher the chance
                excess_rain = rain_mm - drainage_limit
                flood_prob = min(0.95, 0.5 + (excess_rain / 50.0))
            else:
                # Rain is handled by drainage
                flood_prob = 0.05
            
            if np.random.random() < flood_prob:
                # IT FLOODS!
                # Jitter location slightly (within 100m)
                jit_lat = spot['lat'] + np.random.uniform(-0.001, 0.001)
                jit_lng = spot['lng'] + np.random.uniform(-0.001, 0.001)
                
                dataset.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'location': spot['name'],
                    'lat': jit_lat,
                    'lng': jit_lng,
                    'severity': spot['category'],
                    'rainfall_mm': rain_mm,
                    'drainage_capacity': drainage_limit, # Feature for helping debug (not for training necessarily)
                    'flood_occurred': 1
                })
                
    # Add "Non-Flood" events: Valid locations that DID NOT flood
    # This teaches the model: "High Rain != Flood Everywhere" (Crucial for Geography)
    for _, rain_row in rainy_days.iterrows():
        # Generate random "Safe" locations
        for _ in range(5):
            safe_lat = np.random.uniform(28.5, 28.8)
            safe_lng = np.random.uniform(77.0, 77.3)
            
            # Safe areas generally have better drainage (simulated)
            # implicitly, if it's not in our 'flood' set, it handled the rain.
            # But we need explicit 0s.
            
            dataset.append({
                'date': rain_row['date'].strftime('%Y-%m-%d'),
                'location': 'Safe Zone',
                'lat': safe_lat,
                'lng': safe_lng,
                'severity': 'None',
                'rainfall_mm': rain_row['rainfall_mm'],
                'drainage_capacity': 100, # Implicit
                'flood_occurred': 0
            })

    df = pd.DataFrame(dataset)
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"✅ Generated {len(df)} records in {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_dataset()

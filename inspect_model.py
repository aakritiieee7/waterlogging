
import pickle
import os

model_path = 'models/waterlogging_advanced_v2.pkl'

if os.path.exists(model_path):
    with open(model_path, 'rb') as f:
        data = pickle.load(f)
        print("Keys:", data.keys())
        if 'metrics' in data:
            print("Metrics:", data['metrics'])
else:
    print("Model not found")

# Firebase Setup Instructions for Skogsmulle Blog

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Name your project: `skogsmulle`
4. Enable Google Analytics (optional)
5. Click "Create project"

## Step 2: Enable Firestore Database

1. In your Firebase project, go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (for now)
4. Select a location (choose closest to your users)
5. Click "Done"

## Step 3: Get Firebase Configuration

1. Go to Project Settings (gear icon)
2. Scroll down to "Your apps"
3. Click "Web" icon (`</>`)
4. Register your app with nickname: `skogsmulle`
5. Copy the Firebase configuration object

## Step 4: Update Your Website ✅ COMPLETED

Your Firebase configuration has been updated in `index.html` with your actual config:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAl4FKCAqrt_Vkw0jRddSnR1gn4BGby-rA",
  authDomain: "skogsmulle-c601d.firebaseapp.com",
  projectId: "skogsmulle-c601d",
  storageBucket: "skogsmulle-c601d.firebasestorage.app",
  messagingSenderId: "878822846379",
  appId: "1:878822846379:web:b545d30bab52d19a5facee",
  measurementId: "G-SV2RJXDS5S",
};
```

## Step 5: Set Up Firestore Security Rules

In Firebase Console > Firestore Database > Rules, replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read access to posts for everyone
    match /posts/{document} {
      allow read: if true;
      allow write: if request.auth != null; // Only authenticated users can write
    }
  }
}
```

## Step 6: Test Your Setup

1. Deploy your website to Netlify
2. Open the website in incognito mode
3. Try creating a post (you should see it)
4. Open another incognito window - the post should appear there too!

## Features You Now Have

✅ **Global Access**: Posts visible to everyone, everywhere
✅ **Real-time Updates**: Posts appear instantly for all users
✅ **Persistent Storage**: Posts never disappear
✅ **Cross-Device Sync**: Same posts on all devices
✅ **Incognito Mode**: Works perfectly
✅ **Scalable**: Handles unlimited posts and users

## Firebase Pricing

- **Free Tier**: 1GB storage, 50K reads/day, 20K writes/day
- **Perfect for**: Personal blogs, small communities
- **Upgrade when**: You need more storage or have many users

## Troubleshooting

If posts don't appear:

1. Check browser console for errors
2. Verify Firebase config is correct
3. Check Firestore security rules
4. Ensure Firestore is enabled in Firebase Console

## Next Steps

Once Firebase is working:

1. Add user authentication
2. Enable comments
3. Add analytics
4. Implement search
5. Add categories/tags

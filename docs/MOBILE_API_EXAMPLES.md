# Mobile REST API Documentation & Client Integration Guide

**Platform Version:** 7.0.0 / Mobile v1  
**Target Clients:** Flutter (iOS & Android), React Native, Kotlin (Android), Swift (iOS)

---

## 1. Authentication & Security (HMAC SHA-256 JWT)

All secure mobile endpoints accept the `Authorization` header with a Bearer JWT token:

```http
Authorization: Bearer <JWT_TOKEN>
```

### 1.1 Mobile Login & Bootstrap Session

**Endpoint:** `POST /api/v1/mobile/auth`

**Request Payload:**
```json
{
  "email": "learner@nihongobridge.com",
  "brandSlug": "nihongo"
}
```

**Response (HTTP 200 OK):**
```json
{
  "ok": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 2592000,
    "user": {
      "id": 1,
      "email": "learner@nihongobridge.com",
      "displayName": "learner",
      "role": "learner"
    }
  }
}
```

---

## 2. Paginated Learning Endpoints

### 2.1 Vocabulary Feed (with Filtering & Pagination)

**Endpoint:** `GET /api/v1/mobile/vocabulary?jlptLevel=N5&page=1&limit=10`

**Response (HTTP 200 OK):**
```json
{
  "ok": true,
  "data": [
    {
      "id": 1,
      "category": "vocabulary",
      "jlptLevel": "N5",
      "japanese": "食べる",
      "furigana": "たべる",
      "romaji": "taberu",
      "meaning": "To eat",
      "exampleSentenceJa": "毎日、朝ご飯を食べます。",
      "exampleSentenceEn": "I eat breakfast every day."
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasMore": false
  }
}
```

---

## 3. Flutter / Dart Client Code Example

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class NihongoBridgeApiClient {
  final String baseUrl;
  String? _jwtToken;

  NihongoBridgeApiClient({this.baseUrl = 'https://api.nihongobridge.com/api/v1'});

  Future<void> login(String email) async {
    final response = await http.post(
      Uri.parse('$baseUrl/mobile/auth'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'brandSlug': 'nihongo'}),
    );
    if (response.statusCode == 200) {
      final json = jsonDecode(response.body);
      _jwtToken = json['data']['token'];
    }
  }

  Future<List<dynamic>> fetchVocabulary({String jlptLevel = 'N5'}) async {
    final response = await http.get(
      Uri.parse('$baseUrl/mobile/vocabulary?jlptLevel=$jlptLevel'),
      headers: {'Authorization': 'Bearer $_jwtToken'},
    );
    final json = jsonDecode(response.body);
    return json['data'];
  }
}
```

import json
import tempfile
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server import make_server


class TogetherServerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.server = make_server("127.0.0.1", 0, self.temp.name)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.temp.cleanup()

    def request(self, path, method="GET", payload=None, data=None, headers=None):
        body = data if data is not None else (json.dumps(payload).encode() if payload is not None else None)
        request = Request(self.base + path, data=body, method=method, headers=headers or {})
        with urlopen(request, timeout=3) as response:
            return response, response.read()

    def test_match_upload_range_and_shared_control(self):
        avatar = "data:image/png;base64,AA=="
        _, body = self.request("/v1/match", "POST", {"name": "Yuki", "avatar": avatar, "maxMembers": 5})
        first_wait = json.loads(body)
        self.assertTrue(first_wait["matchWaiting"])
        state = self.server.RequestHandlerClass.state
        self.assertEqual(state.rooms, {})
        _, body = self.request("/v1/match", "POST", {"name": "Mio"})
        second = json.loads(body)
        _, body = self.request("/v1/match", "POST", {"name": "Yuki", "avatar": avatar, "matchToken": first_wait["matchToken"]})
        first = json.loads(body)
        self.assertEqual(first["roomCode"], second["roomCode"])
        self.assertEqual(second["maxMembers"], 5)
        self.assertEqual(second["syncQuality"], "opus")
        self.assertEqual([member["name"] for member in second["members"]], ["Yuki", "Mio"])
        self.assertEqual(second["members"][0]["avatar"], avatar)
        self.assertEqual(second["members"][0]["ipLocation"], "本地网络")

        code, token = first["roomCode"], first["token"]
        audio = b"0123456789"
        _, body = self.request(
            f"/v1/rooms/{code}/track?token={token}",
            "POST",
            {"title": "Test", "artist": "Echo", "sizeBytes": len(audio), "fileName": "test.flac", "quality": "direct", "state": "playing", "positionSeconds": 4},
        )
        upload = json.loads(body)

        with self.assertRaises(HTTPError) as error:
            self.request(
                f"/v1/rooms/{code}/track?token={second['token']}",
                "POST",
                {"title": "Competing", "sizeBytes": len(audio), "fileName": "other.flac", "quality": "direct"},
            )
        self.assertEqual(error.exception.code, 409)
        self.assertEqual(json.loads(error.exception.read())["error"], "upload_in_progress")
        error.exception.close()

        request = Request(upload["uploadUrl"], data=audio, method="PUT", headers={"Content-Length": str(len(audio))})
        with urlopen(request, timeout=3):
            pass

        _, body = self.request(f"/v1/rooms/{code}?token={second['token']}")
        snapshot = json.loads(body)
        self.assertEqual(snapshot["track"]["title"], "Test")
        self.assertEqual(snapshot["track"]["fileName"], "test.flac")
        self.assertEqual(snapshot["track"]["metadata"]["artist"], "Echo")
        self.assertIn("/test.flac?", snapshot["track"]["streamUrl"])
        self.assertEqual(snapshot["controllerName"], "Yuki")

        response, partial = self.request(snapshot["track"]["streamUrl"].removeprefix(self.base), headers={"Range": "bytes=2-5"})
        self.assertEqual(response.status, 206)
        self.assertEqual(partial, b"2345")

        _, body = self.request(
            f"/v1/rooms/{code}/state?token={second['token']}",
            "POST",
            {"mediaId": snapshot["track"]["id"], "state": "paused", "positionSeconds": 7},
        )
        controlled = json.loads(body)
        self.assertEqual(controlled["controllerName"], "Mio")
        self.assertEqual(controlled["playback"]["positionSeconds"], 7)
        self.assertEqual(controlled["track"]["id"], snapshot["track"]["id"])
        self.assertIsNone(state.rooms[code]["pending"])

        _, body = self.request(
            f"/v1/rooms/{code}/profile?token={second['token']}",
            "POST",
            {"name": "Mio 2", "avatar": avatar},
        )
        profile = json.loads(body)
        self.assertIn("Mio 2", [member["name"] for member in profile["members"]])

        _, body = self.request(
            f"/v1/rooms/{code}/quality?token={second['token']}",
            "POST",
            {"quality": "direct"},
        )
        quality = json.loads(body)
        self.assertEqual(quality["syncQuality"], "direct")

        _, body = self.request(
            f"/v1/rooms/{code}/state?token={first['token']}",
            "POST",
            {"mediaId": snapshot["track"]["id"], "state": "ended", "positionSeconds": 10},
        )
        ended = json.loads(body)
        self.assertEqual(ended["playback"]["state"], "ended")
        state = self.server.RequestHandlerClass.state
        track_path = state.rooms[code]["track"]["path"]
        ended_at = state.rooms[code]["track"]["endedAtMs"]
        _, body = self.request(
            f"/v1/rooms/{code}/state?token={second['token']}",
            "POST",
            {"mediaId": snapshot["track"]["id"], "state": "ended", "positionSeconds": 10},
        )
        self.assertEqual(state.rooms[code]["track"]["endedAtMs"], ended_at)
        state.rooms[code]["track"]["endedAtMs"] = int((time.time() - 61) * 1000)
        state.cleanup()
        self.assertFalse(__import__("pathlib").Path(track_path).exists())
        self.assertIsNone(state.rooms[code]["track"])

        with self.assertRaises(HTTPError) as error:
            self.request("/v1/match", "POST", {"name": ""})
        self.assertEqual(error.exception.code, 400)
        error.exception.close()

    def test_single_member_room_stays_until_empty(self):
        _, body = self.request("/v1/rooms", "POST", {"name": "Yuki", "maxMembers": "invalid"})
        room = json.loads(body)
        state = self.server.RequestHandlerClass.state
        self.assertEqual(room["maxMembers"], 2)
        state.rooms[room["roomCode"]]["createdAt"] = time.time() - 121
        state.cleanup()
        self.assertIn(room["roomCode"], state.rooms)
        member_id = room["clientId"]
        state.rooms[room["roomCode"]]["members"][member_id]["lastSeen"] = time.time() - 61
        state.cleanup()
        self.assertNotIn(room["roomCode"], state.rooms)


if __name__ == "__main__":
    unittest.main()

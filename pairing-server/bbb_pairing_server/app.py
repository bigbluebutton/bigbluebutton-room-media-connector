import asyncio
from quart import Quart, websocket
import json
import secrets
import traceback
from atomicx import AtomicInt

app = Quart(__name__)

pin_rollover = 600

to_plugin = {}
to_room = {}
pin_to_room = {}
room_config = {}
room_connections = AtomicInt()


def validate_client_config(config) -> bool:
    return True  # Todo: see issue #4


def generate_pin():
    while True:
        pin = secrets.randbelow(int(1e6 - 1e5)) + int(1e5)
        pin_free = pin not in pin_to_room
        if pin_free:
            return pin


async def generate_pin_task(connection_id):
    print(f"pin task: started {connection_id}")
    q = to_room[connection_id]
    try:
        while True:
            pin = generate_pin()
            await q.put({'pin': pin, 'timeout': pin_rollover})
            print(f"pin task: generated pin {pin} for {connection_id}")
            await asyncio.sleep(pin_rollover)
            await asyncio.sleep(0.0)
    except asyncio.CancelledError:
        print(f"pin task: cancelled for channel {connection_id}")
        return
    except Exception as e:
        print("exception 2")
        traceback.print_exception(e)
        return


@app.websocket('/ws_room')
async def handle_room() -> None:
    pin_task = None
    forward_task = None
    connection_id = None
    last_pin = None
    try:
        data = await websocket.receive()
        data = json.loads(data)
        if 'config' not in data:
            return
        config = data['config']
        connection_id = room_connections.inc()
        room_config[connection_id] = config
        print(f'room config: {connection_id} is {config}')
        to_room[connection_id] = asyncio.Queue()
        pin_task = asyncio.create_task(generate_pin_task(
            connection_id), name=f"pin_generate_{connection_id}")
        while True:
            msg = await to_room[connection_id].get()
            print(f"room queue received {msg}")
            if 'pin' in msg:
                pin = msg['pin']
                if last_pin:
                    del pin_to_room[last_pin]
                last_pin = pin
                pin_to_room[pin] = connection_id
                await websocket.send(
                    json.dumps(
                        {
                            'action': 'new_pin',
                            'pin': pin,
                            'timeout': pin_rollover
                        }
                    )
                )
            elif 'start' in msg:
                await websocket.send(
                    json.dumps(
                        {
                            'action': 'start',
                            'urls': msg['urls'],
                            'pairing_pin': msg['pairing_pin']
                        }
                    )
                )
                forward_task = asyncio.create_task(
                    forward_from_queue_to_websocket(
                        to_room[connection_id], websocket)
                )
            elif 'stop_pin_generation' in msg:
                pin_task.cancel()
            elif 'start_pin_generation' in msg:
                if pin_task is not None or pin_task.cancelled():
                    pin_task = asyncio.create_task(generate_pin_task(connection_id),
                                                   name=f"pin_generate_{connection_id}")

    finally:
        print("room close")
        if pin_task:
            pin_task.cancel()
        if forward_task:
            forward_task.cancel()
        if connection_id:
            q = to_room[connection_id]
            while not q.empty():
                await q.get()
            del to_room[connection_id]
            del q


@app.websocket('/ws')
async def handle_ws() -> None:
    pin_generation_stopped = False
    # pin provided by bbb plugin
    pin = None
    # verification pin after conn established
    pairing_pin = secrets.randbelow(int(1e6 - 1e5)) + int(1e5)
    forward_task = None
    try:
        data = await websocket.receive_json()
        print(f"plugin received {data}")
        pin = data['pin']
        if pin not in pin_to_room:
            await websocket.send(json.dumps({'status': 404, 'msg': 'PIN not found'}))
            return
        room_connection_id = pin_to_room[pin]
        config = room_config.get(room_connection_id)
        print(f"plugin found config {config}")
        if config is None:
            print("no config")
            await websocket.send(json.dumps({'status': 500, 'msg': 'client config not found. This is a bug'}))
            return
        if not validate_client_config(config):
            await websocket.send(json.dumps({'status': 500, 'msg': 'invalid client config'}))
            return
        print("config is valid")
        print("sende stop_pin_generation")
        to_room_queue = to_room[room_connection_id]
        await to_room_queue.put({'stop_pin_generation': True})
        pin_generation_stopped = True
        print("gesendet")
        await websocket.send_json({'status': 200, 'msg': 'ok', 'config': config})
        # jetzt bekommen wir die URLs
        print("Warte auf URLS")
        data = await websocket.receive_json()
        print(f"empfangen: {data}")
        if 'urls' not in data:
            await websocket.send(json.dumps({'status': 500, 'msg': 'invalid format. Expecting urls'}))
            return
        to_plugin[pin] = asyncio.Queue()
        await to_room_queue.put({'start': True, 'urls': data['urls'], 'pairing_pin': pairing_pin})
        await websocket.send(json.dumps({'status': 200, 'msg': 'pairing', 'pairing_pin': pairing_pin}))
        forward_task = asyncio.create_task(
            forward_from_queue_to_websocket(to_plugin[pin], websocket))
        while True:
            data = await websocket.receive()
            data = json.loads(data)
            await to_room.put(data)

        # wait for session terminate

    except KeyError:
        await websocket.send(json.dumps({'status': 500, 'msg': 'invalid format'}))
        return
    except Exception as e:
        traceback.print_exception(e)
        return
    finally:
        print("closing plugin")
        if pin_generation_stopped:
            await to_room_queue.put({'start_pin_generation': True})
        if forward_task:
            forward_task.cancel()
        if pin in to_plugin:
            while not to_plugin[pin].empty():
                await to_plugin[pin].get()
            del to_plugin[pin]
        await websocket.close(1007)
        print("closed plugin")
        return


async def forward_from_queue_to_websocket(q, websocket):
    try:
        while True:
            data = await q.get()
            if 'type' in data and data['type'] == 'ping':
                continue
            await websocket.send_json(data)
    except asyncio.CancelledError:
        return


def run() -> None:
    app.run()

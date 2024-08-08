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
        print("pin task: exception 2")
        traceback.print_exception(e)
        return


@app.websocket('/ws_room')
async def handle_room() -> None:
    pin_task = None
    forward_task = None
    connection_id = None
    last_pin = None
    await websocket.send(json.dumps({'hello': 'starting ;)'}))
    try:
        data = await websocket.receive()
        data = json.loads(data)
        print(f"@ws_room: Received data: {json.dumps(data, indent=2)}")
        if 'config' not in data:
            return
        config = data['config']
        connection_id = room_connections.inc()
        room_config[connection_id] = config
        print(f'@ws_room: New room has ID {connection_id}')
        to_room[connection_id] = asyncio.Queue()
        pin_task = asyncio.create_task(generate_pin_task(
            connection_id), name=f"pin_generate_{connection_id}")
        while True:
            msg = await to_room[connection_id].get()
            to_room[connection_id].task_done()
            print(f"@ws_room: Room queue received: {json.dumps(msg, indent=2)}")
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
                    forward_from_ws_to_q(
                        to_plugin[msg['connection_id']], websocket)
                )
            elif 'stop_pin_generation' in msg:
                pin_task.cancel()
            elif 'start_pin_generation' in msg:
                if pin_task is not None or pin_task.cancelled():
                    pin_task = asyncio.create_task(generate_pin_task(connection_id),
                                                   name=f"pin_generate_{connection_id}")

    finally:
        print("@ws_room: Closing room.")
        if pin_task:
            pin_task.cancel()
        if forward_task:
            forward_task.cancel()
        if connection_id:
            q = to_room[connection_id]
            while not q.empty():
                await q.get()
                q.task_done()
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
        print(f"@ws: Plugin received data: {json.dumps(data, indent=2)}")
        pin = data['pin']
        if pin not in pin_to_room:
            await websocket.send(json.dumps({'status': 404, 'msg': 'PIN not found'}))
            return
        room_connection_id = pin_to_room[pin]
        config = room_config.get(room_connection_id)
        print(f"@ws: Plugin found config: {json.dumps(config, indent=2)}")
        if config is None:
            print("@ws: No config!")
            await websocket.send(json.dumps({'status': 500, 'msg': 'client config not found. This is a bug'}))
            return
        if not validate_client_config(config):
            print("@ws: Invalid config!")
            await websocket.send(json.dumps({'status': 500, 'msg': 'invalid client config'}))
            return
        print("@ws: Config is valid. Will send stop_pin_generation.")
        to_room_queue = to_room[room_connection_id]
        await to_room_queue.put({'stop_pin_generation': True})
        pin_generation_stopped = True
        print("@ws: stop_pin_generation event send.")
        await websocket.send_json({'status': 200, 'msg': 'ok', 'config': config})
        print("@ws: Waiting for join URLs!")
        data = await websocket.receive_json()
        print(f"@ws: received: {json.dumps(data, indent=2)}")
        if 'urls' not in data:
            await websocket.send(json.dumps({'status': 500, 'msg': 'invalid format. Expecting urls'}))
            return
        plugin_connection_id = pin
        to_plugin[plugin_connection_id] = asyncio.Queue()
        print(f"@ws: Generated plugin queue with key: {pin}")
        await to_room_queue.put({'start': True, 'urls': data['urls'], 'pairing_pin': pairing_pin, 'connection_id':  plugin_connection_id})
        await websocket.send(json.dumps({'status': 200, 'msg': 'pairing', 'pairing_pin': pairing_pin}))
        forward_task = asyncio.create_task(
            forward_from_queue_to_websocket(to_plugin[plugin_connection_id], websocket))
        while True:
            data = await websocket.receive()
            data = json.loads(data)
            print(f"@ws: Data received from room: {data}")
            await to_room.put(data)

        # wait for session to terminate

    except KeyError:
        await websocket.send(json.dumps({'status': 500, 'msg': 'invalid format'}))
        return
    except Exception as e:
        traceback.print_exception(e)
        return
    finally:
        print("@ws: Closing plugin.")
        if pin_generation_stopped:
            await to_room_queue.put({'start_pin_generation': True})
        if forward_task:
            print("@ws Cancelling forward_task!")
            forward_task.cancel()
        if pin in to_plugin:
            while not to_plugin[pin].empty():
                msg = await to_plugin[pin].get()
                print(f"@ws: still in queue: {msg}")
                to_plugin[pin].task_done()
            del to_plugin[pin]
        await websocket.close(1007)
        print("@ws: Plugin closed.")
        return


async def forward_from_queue_to_websocket(q, websocket):
    try:
        while True:
            data = await q.get()
            data = json.loads(data)
            if 'type' in data and data['type'] == 'ping':
                continue
            print(f"Forwarding data from queue to websocket: {data}")
            await websocket.send_json(data)
            q.task_done()
    except asyncio.CancelledError:
        return


async def forward_from_ws_to_q(q, websocket):
    try:
        while True:
            data = await websocket.receive()
            data = json.loads(data)
            if 'type' in data and data['type'] == 'ping':
                continue
            print(f"Forwarding data from websocket to queue: {data}")
            await q.put(json.dumps(data))
    except asyncio.CancelledError:
        return


def run() -> None:
    app.run()

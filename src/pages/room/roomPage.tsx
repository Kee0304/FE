import { ReactNode, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CodeSnapshot } from '../../model/CodeSnapshot';
import Drawer from '../../components/GlassDrawer/Drawer';
import RoomHeader from '../../components/RoomHeader';
import CodeEditor from '../../components/CodeEditor/CodeEditor';
import { Sock } from '../../utils/socket/Socket';
import { RoomInfo } from '../../model/RoomInfo';
import { AxiosResponse } from 'axios';
import axi from '../../utils/axios/Axios';
import CodeSnapshotUI from '../../components/CodeSnapshot/CodeSnapshotUI';
import { IMessage } from '@stomp/stompjs';
import { Map } from 'immutable';


const RoomPage = () => {
  // 마운트 시 useEffect 실행 방지
  const [isMounted,setMounted] = useState<boolean>(false);
  const [roomMounted, setRoomMounted] = useState<boolean>(false);
  // 처음 표시되어야할 코드를 표시할 때 메세지 송신 방지용 flag
  const [isInitial, setInitial] =useState<boolean>(true); 
  // 내가 받은 것인지, 남에게서 받은 것인지 판별
  const [isReceived, setIsReceived] = useState<boolean>(true);
  // 파라미터
  const params:Readonly<Partial<{ roomId: string; }>> = useParams<{ roomId: string }>();;
  // 디바운싱 timer
  const timer:React.MutableRefObject<ReturnType<typeof setTimeout>|undefined> = useRef(undefined);
  // 날짜
  const todayDate = useRef<Date>(new Date());
  const year:number = todayDate.current.getFullYear();
  const month:number = todayDate.current.getMonth()+1;
  const date:number = todayDate.current.getDate();
  const stringYear:string = year.toString();
  const stringMonth:string = month.toString();
  const stringDate:string = date.toString();

  // textarea disabled (유저 권한에 따름)
  // const [disabled, setDisabled] = useState<boolean>(true);

  // const commentPage = useRef<number>(0);
  // 스냅샷 타이틀
  const [snapshotTitle, setSnapshotTitle] = useState<string>(`${year}-${month.toString().length == 2? month : "0"+month}-${date.toString.length == 2 ? date : "0"+date}`);

  // 방 정보
  const [roomInfo, setRoomInfo] = useState<RoomInfo>(new RoomInfo("","","","",[],[],[]));
  // 코드
  const [code, setCode] = useState<string>(""); 
  // 코드 스냅샷 확인 후 되돌리기 위해 이전 코드를 저장
  const [prevCode, setPrevCode] = useState<string|undefined>(undefined);
  // 스냅샷들 (년:월:일:[])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialSnapshots:Map<string, Map<string, Map<string, any>>> = Map([
    [stringYear, Map([
      [stringMonth, Map([
        [stringDate, []]
      ])]
    ])]
  ]);
  // 스냅샷들
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [snapshots, setSnapshots] = useState<Map<string, Map<string, Map<string, any>>>>(initialSnapshots);
  // 선택된 날짜에 존재하는 코드 스냅샷들
  const [dailySanpshots, setDailySnapshots] = useState<CodeSnapshot[]>([]);
  // 코멘트들
  // const [comments, setComments] = useState<Comment[]>([]);
  // 소켓 객체
  const sock = useRef<Sock>(Sock.createInstance());
  
  // drawer 관련
  const [open, setOpen] = useState<boolean>(false);
  

  const saveSnapshot = ():void => {
    const savedSnapshot:CodeSnapshot = new CodeSnapshot(snapshotTitle, code, new Date().toString())
    sock.current.sendSnapshot(savedSnapshot);
  }

  // 아이콘이 클릭 되었을 때 동작
  const onIconClicked = (event:React.MouseEvent) => {
    const clickedTitle:string|null = event.currentTarget.id;
    if (clickedTitle) {
      setDrawerTitle((prevData) => {
        if (prevData === clickedTitle) {
          setOpen(!open);
        } else {
          if (clickedTitle === "이해도 조사") {
            setDrawerChildren(<div>이해도 조사</div>)
          }
          else {
            setDrawerChildren(<CodeSnapshotUI year={year} month={month} snapshots={snapshots} setIsReceived={setIsReceived} setCode={setCode} setSnapshots={setSnapshots} roomId={params.roomId} dailySnapshots={dailySanpshots} setDailySnapshots={setDailySnapshots} savePrevCode={savePrevCode}/>);
          }
          setOpen(true);
        }
        return clickedTitle;
      });
    }
  }


  const savePrevCode = ():void => {
    setPrevCode(code);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const restoreCode = (_e:React.MouseEvent<HTMLSpanElement, MouseEvent>):void => {
    setIsReceived(true);
    if (prevCode) {
      setCode(prevCode);
    }
    setPrevCode(undefined);
    setTimeout(() => {
      setIsReceived(false);
    },300)
  }

  // 코드 업데이트 로직
  const updateCode = async (receivedCode:string) => {
    setIsReceived(true);
    setCode((prev) => {
      if (receivedCode == prev) {
        return prev;
      }
      else {
        return receivedCode;
      }
    });
  }
  // const addComment = (comment:Comment):void => {
  //   setComments([...comments,comment])
  // } 

  // const addSnapshot = (snapshot:CodeSnapshot):void => {
  //   setSnapshots([...snapshots,snapshot])
  // }

  // 스냅샷이 새로 저장되었다는 메세지를 받을 시 하는 행동
  const getNewSnapshot = async (message: IMessage) => {
    const response = await axi.get(`room/${params.roomId}/snapshot/${year}/${month}/${date}`);
    const dailySnapshots: number[] = response.data;
    setSnapshots((prevData) => {
    const nextState = prevData.setIn([stringYear, stringMonth, stringDate], dailySnapshots);
        return nextState;
    });
    setDailySnapshots((prevData) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsonMessage:any = JSON.parse(message.toString())
      const lastSnapshot:CodeSnapshot = new CodeSnapshot(
        jsonMessage.title,
        jsonMessage.content,
        jsonMessage.createdDate
      )
      return [lastSnapshot,...prevData]
    });

  }


  // 페이지 로드 시 방 정보, 
  const pageOnload = async() => {
    // 방 정보
    const roomInfoResponse:AxiosResponse = await axi.get(`room/${params.roomId}`);
    setRoomInfo(RoomInfo.fromJson(roomInfoResponse.data));
    // 소켓 연결
    sock.current.connect(['code', 'snapshot'],[updateCode, getNewSnapshot]);
    await sock.current.joinRoom(params.roomId);

    // 오늘자 스냅샷
    const dailySnapshotsResponse:AxiosResponse = await axi.get(`room/${params.roomId}/snapshot/${year}/${month}/${date}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todayDailySnapshots:CodeSnapshot[] = dailySnapshotsResponse.data.map(((el:any) => CodeSnapshot.fromJson(el)));
    setSnapshots((prevData) => {
    const nextState = prevData.setIn([stringYear, stringMonth, stringDate], todayDailySnapshots);
        return nextState;
    });
    setDailySnapshots(todayDailySnapshots);
    // Sock.subscribe('comment'
    //   , addComment
    // );
    // Sock.subscribe('snapshot'
    //   , addSnapshot
    // );
    // Sock.subscribe('checkup');
    // 교사용 추가 예정
  }

  // 페이지 mount시
  useEffect(() => {
    pageOnload();
    // 브라우저 종료 시 unsubscribe;
    window.addEventListener('beforeunload', () => {
      sock.current.unsubscribe();
    })

    return () => {
      sock.current.unsubscribe();
      window.removeEventListener('beforeunload', () => {
        sock.current.unsubscribe();
      });
    }

  },[])

  const updateSnapshots = async ():Promise<void> => {    
    const response:AxiosResponse = await axi.get(`room/${params.roomId}/snapshot/${year}/${month}/${date}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dailySnapshots:CodeSnapshot[] = response.data.map((el:any) => CodeSnapshot.fromJson(el));
    setSnapshots((prevData) => {
      const nextState = prevData.setIn([stringYear, stringMonth, stringDate], dailySnapshots);
      return nextState;
  });
  }
  const [drawerTitle, setDrawerTitle] = useState<string>("코드 스냅샷");
  const [drawerChildren, setDrawerChildren] = useState<ReactNode>(<CodeSnapshotUI year={year} month={month} snapshots={snapshots} setIsReceived={setIsReceived} setCode={setCode} setSnapshots={setSnapshots} roomId={params.roomId} dailySnapshots={dailySanpshots} setDailySnapshots={setDailySnapshots} savePrevCode={savePrevCode}/>);

  // 방 정보 받아왔을 때 스냅샷 업데이트
  useEffect(() => {
    if (roomMounted === false) {
      setRoomMounted(true);
    }
    else {
      updateSnapshots(); // 비동기 함수 호출
      setCode(roomInfo.getContent());
    }
  }, [roomInfo]);


  // 코드 pub
  useEffect(() => {
    if (!isMounted) {
      
      // 첫 마운트 시에는 아무 동작도 하지 않음
      setMounted(true);
      return; 
    }

    if (isInitial) {
      // 첫 코드 표시 시에는 메세지를 보내지 않음
      setInitial(false);
      return;
    }

    if (isReceived) {
      setIsReceived(false); // 수신된 경우에는 그냥 상태 초기화
      return;
    }

    // 디바운싱 및 코드 송신
    if (timer.current) {
      clearTimeout(timer.current);
    }
    
    timer.current = setTimeout(() => {
      // 코드가 변경된 후에만 송신
      sock.current.sendCode(code);

      // 송신 후 잠시 후에 isReceived를 false로 리셋
      setTimeout(() => {
        setIsReceived(false);
      }, 100); // 100ms 정도 후에 초기화 (이 값은 조정 가능)
    }, 500);

    return () => {
      clearTimeout(timer.current); // cleanup 함수
    };
  }, [code]);

  const focus = ():void => {
    let textarea:HTMLElement|null = document.getElementById('text-area');
    if (textarea) {
      textarea.focus();
    }
    textarea = null;
  }

  useEffect(()=>{
    setDrawerChildren(<CodeSnapshotUI year={year} month={month} snapshots={snapshots} setIsReceived={setIsReceived} setCode={setCode} setSnapshots={setSnapshots} roomId={params.roomId} dailySnapshots={dailySanpshots} setDailySnapshots={setDailySnapshots} savePrevCode={savePrevCode}/>)
  },[snapshots, dailySanpshots]);


  return (
    <div className='bg-[#212121] w-full min-h-screen max-h-screen h-auto overflow-auto'>
      <RoomHeader onIconClicked={onIconClicked} snapshotTitle={snapshotTitle} setSnapshotTitle={setSnapshotTitle}/>
      <div className='relative min-h-lvh' onClick={focus}>
        <CodeEditor code={code} setCode={setCode}/>
        <Drawer title={drawerTitle} children={drawerChildren} isOpen={open} setOpen={setOpen} code={code} saveSnapshot={saveSnapshot} prevCode={prevCode} restoreCode={restoreCode}/>
      </div>
    </div>
  )
}

export default RoomPage